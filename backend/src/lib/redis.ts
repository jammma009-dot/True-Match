import Redis from "ioredis";
import { env } from "../config/env";

/**
 * Redis is used for:
 *  - swipe rate limiting (per-user daily counter)
 *  - online presence tracking (optional; DB also stores isOnline)
 *  - future WebSocket pub/sub when scaled to multiple instances
 *
 * If REDIS_URL is not set, we degrade gracefully: rate limiting becomes a
 * no-op so local development without Redis still works.
 */
let client: Redis | null = null;

if (env.REDIS_URL) {
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  client.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[redis] error:", err.message);
  });
} else {
  // eslint-disable-next-line no-console
  console.warn("[redis] REDIS_URL not set — rate limiting & presence disabled.");
}

export const redis = client;

/** Whether Redis is available. */
export const redisEnabled = (): boolean => client !== null;
