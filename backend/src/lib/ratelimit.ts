import { Request, Response, NextFunction } from "express";
import { redis, redisEnabled } from "./redis";

/**
 * Simple per-user daily swipe rate limit backed by Redis.
 * Degrades to "always allowed" when Redis is not configured.
 */
export const DAILY_SWIPE_LIMIT = 200;

/**
 * Generic fixed-window rate-limit middleware, keyed by the authenticated user
 * (falls back to client IP for unauthenticated routes). Backed by Redis; if
 * Redis isn't configured it becomes a no-op so local dev still works.
 *
 * Use AFTER requireAuth where a user-scoped limit is wanted.
 */
export function rateLimit(name: string, max: number, windowSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!redisEnabled() || !redis) {
      next();
      return;
    }
    const who = req.authUser?.id ?? req.ip ?? "anon";
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${name}:${who}:${bucket}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      if (count > max) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
    } catch {
      // On any Redis hiccup, fail open (don't block legitimate traffic).
    }
    next();
  };
}

export async function checkAndIncrSwipe(
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!redisEnabled() || !redis) {
    return { allowed: true, remaining: DAILY_SWIPE_LIMIT };
  }

  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `swipes:${userId}:${day}`;

  const count = await redis.incr(key);
  if (count === 1) {
    // Expire at ~end of day (24h TTL is fine for MVP).
    await redis.expire(key, 24 * 60 * 60);
  }

  const remaining = Math.max(0, DAILY_SWIPE_LIMIT - count);
  return { allowed: count <= DAILY_SWIPE_LIMIT, remaining };
}
