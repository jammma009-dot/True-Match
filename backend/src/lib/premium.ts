/** Default Premium price (Telegram Stars) if the admin hasn't set one. */
export const DEFAULT_PREMIUM_STARS = 250;

/** Daily "like" cap for FREE users. Premium users have unlimited likes. */
export const FREE_DAILY_LIKES = 20;

/**
 * Start of "today" in Tashkent time (UTC+5, no DST), returned as the equivalent
 * UTC instant. The free like counter resets when this boundary advances — i.e.
 * every day at local (Uzbekistan) midnight, giving free users a fresh 20 likes.
 */
export function startOfDayTashkent(now: Date = new Date()): Date {
  const OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5
  const wall = new Date(now.getTime() + OFFSET_MS); // wall-clock time in UTC fields
  const midnightWallUtc = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
  );
  return new Date(midnightWallUtc - OFFSET_MS);
}

/** How long a Premium purchase lasts. */
export const PREMIUM_DAYS = 30;

/** True if the given premiumUntil date represents an active subscription. */
export function isPremiumActive(premiumUntil: Date | null | undefined): boolean {
  return !!premiumUntil && premiumUntil.getTime() > Date.now();
}
