/** Default Premium price (Telegram Stars) if the admin hasn't set one. */
export const DEFAULT_PREMIUM_STARS = 250;

/** Daily "like" cap for FREE users. Premium users have unlimited likes. */
export const FREE_DAILY_LIKES = 20;

/** How long a Premium purchase lasts. */
export const PREMIUM_DAYS = 30;

/** True if the given premiumUntil date represents an active subscription. */
export function isPremiumActive(premiumUntil: Date | null | undefined): boolean {
  return !!premiumUntil && premiumUntil.getTime() > Date.now();
}
