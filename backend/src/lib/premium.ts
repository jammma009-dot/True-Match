/** Default Premium price (Telegram Stars) if the admin hasn't set one. */
export const DEFAULT_PREMIUM_STARS = 250;

/** Daily "like" cap for FREE users. Premium users have unlimited likes. */
export const FREE_DAILY_LIKES = 20;

/**
 * On the "Who liked you" screen: free FEMALE users can view (unblurred) their
 * first N likers before needing Premium; free MALE users see all likers
 * blurred/locked regardless of count. Premium users of either gender always
 * see everyone.
 */
export const FREE_LIKES_UNLOCKED_FOR_WOMEN = 10;

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

/**
 * Current hour (0-23) and date-key (YYYY-MM-DD) in Tashkent wall-clock time.
 * Used by the broadcast "autopilot" scheduler to decide when to fire and to
 * make sure it only fires once per day.
 */
export function tashkentNow(now: Date = new Date()): { hour: number; dateKey: string } {
  const OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, no DST
  const wall = new Date(now.getTime() + OFFSET_MS);
  const y = wall.getUTCFullYear();
  const m = String(wall.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wall.getUTCDate()).padStart(2, "0");
  return { hour: wall.getUTCHours(), dateKey: `${y}-${m}-${d}` };
}

/** How long a Premium purchase lasts (fallback plan, when no plans are configured). */
export const PREMIUM_DAYS = 30;

/** True if the given premiumUntil date represents an active subscription. */
export function isPremiumActive(premiumUntil: Date | null | undefined): boolean {
  return !!premiumUntil && premiumUntil.getTime() > Date.now();
}

// ---------- Premium plans (up to 4 selectable price/period combos) ----------

/** One selectable Premium plan: a period in days with its Stars + card (UZS) price. */
export interface PremiumPlan {
  days: number;
  priceStars: number;
  priceUzs: number;
  /** Optional admin-facing label, e.g. "Best value" (not required by the client). */
  label?: string;
}

/** Hard cap on how many plans the admin may configure. */
export const MAX_PREMIUM_PLANS = 4;

/**
 * Resolve the effective list of Premium plans: the admin's configured
 * `premiumPlans` (if any, valid entries only, capped at 4), otherwise a
 * single fallback plan built from the legacy single-price fields.
 */
export function resolvePremiumPlans(settings: {
  premiumPlans?: unknown;
  premiumPriceStars?: number | null;
  premiumPriceUzs?: number | null;
}): PremiumPlan[] {
  const raw = settings.premiumPlans;
  if (Array.isArray(raw) && raw.length > 0) {
    const plans = raw
      .filter(
        (p): p is Record<string, unknown> =>
          !!p && typeof p === "object",
      )
      .map((p) => ({
        days: Number((p as { days?: unknown }).days),
        priceStars: Number((p as { priceStars?: unknown }).priceStars),
        priceUzs: Number((p as { priceUzs?: unknown }).priceUzs),
        label:
          typeof (p as { label?: unknown }).label === "string"
            ? ((p as { label?: string }).label as string)
            : undefined,
      }))
      .filter(
        (p) =>
          Number.isFinite(p.days) &&
          p.days > 0 &&
          Number.isFinite(p.priceStars) &&
          p.priceStars > 0 &&
          Number.isFinite(p.priceUzs) &&
          p.priceUzs > 0,
      )
      .slice(0, MAX_PREMIUM_PLANS);
    if (plans.length > 0) return plans;
  }
  return [
    {
      days: PREMIUM_DAYS,
      priceStars: settings.premiumPriceStars ?? DEFAULT_PREMIUM_STARS,
      priceUzs: settings.premiumPriceUzs ?? DEFAULT_PREMIUM_UZS,
    },
  ];
}

/** Find a specific plan by its period (days), falling back to the first configured plan. */
export function findPremiumPlan(
  plans: PremiumPlan[],
  days: number | undefined,
): PremiumPlan {
  const match = days != null ? plans.find((p) => p.days === days) : undefined;
  return match ?? plans[0];
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

// ---------- Card-to-card payments (CardXabar + userbot) ----------

/** Default Premium price in so'm (UZS) for card payments if unset by the admin. */
export const DEFAULT_PREMIUM_UZS = 20000;

/** Default Present/Boost price in so'm (UZS) for card payments if unset. */
export const DEFAULT_PRESENT_UZS = 10000;

/** How long a card order stays open (minutes) before it expires unmatched. */
export const CARD_ORDER_TTL_MIN = 30;

/**
 * Given a base price in so'm and a unique two-digit suffix (1..99 tiyin), build
 * the exact transfer amount in tiyin. Example: 1000 so'm + 17 → 100017 tiyin
 * (1000.17 UZS). The last two digits identify the specific order.
 */
export function buildAmountTiyin(baseUzs: number, uniqueCents: number): number {
  return baseUzs * 100 + uniqueCents;
}

/** Format an amount in tiyin as a plain decimal string, e.g. 100017 → "1000.17". */
export function formatTiyin(amountTiyin: number): string {
  const som = Math.floor(amountTiyin / 100);
  const tiyin = amountTiyin % 100;
  return `${som}.${tiyin.toString().padStart(2, "0")}`;
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
