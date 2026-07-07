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

/**
 * Whether a profile is "100% complete" (matches the weighted completion bar the
 * user sees): 4+ photos, bio, verification (submitted/verified), height,
 * 3+ interests, smoking, drinking, and study or work.
 */
export function isProfileComplete(
  p: {
    bio: string | null;
    heightCm: number | null;
    smoking: unknown;
    drinking: unknown;
    interests: string[];
    studies?: boolean;
    works?: boolean;
    verificationStatus?: string;
  },
  photoCount: number,
): boolean {
  const verified =
    p.verificationStatus === "verified" || p.verificationStatus === "pending";
  return (
    photoCount >= 4 &&
    !!p.bio &&
    !!p.heightCm &&
    (p.interests?.length ?? 0) >= 3 &&
    !!p.smoking &&
    !!p.drinking &&
    !!(p.studies || p.works) &&
    verified
  );
}

// ---------- Present / Boost ----------

/** Default Present (boost) price in Telegram Stars if the admin hasn't set one. */
export const DEFAULT_PRESENT_STARS = 100;

/** How many days each present/boost adds. */
export const BOOST_DAYS = 3;

/** True if the given boostUntil date represents an active boost. */
export function isBoostActive(boostUntil: Date | null | undefined): boolean {
  return !!boostUntil && boostUntil.getTime() > Date.now();
}

/**
 * Compute the new boost expiry when adding `days` of boost. Boosts STACK: if a
 * boost is already active, the new time is added on top of the remaining time;
 * otherwise it starts from now.
 */
export function stackedBoostUntil(
  current: Date | null | undefined,
  days: number = BOOST_DAYS,
  now: Date = new Date(),
): Date {
  const base = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
  return new Date(base + days * 86_400_000);
}
