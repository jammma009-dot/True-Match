import { redis, redisEnabled } from "./redis";

/**
 * Simple per-user daily swipe rate limit backed by Redis.
 * Degrades to "always allowed" when Redis is not configured.
 */
export const DAILY_SWIPE_LIMIT = 200;

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
