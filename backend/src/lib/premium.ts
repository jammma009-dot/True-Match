/** Default Premium price (Telegram Stars) if the admin hasn't set one. */
export const DEFAULT_PREMIUM_STARS = 250;

/** How long a Premium purchase lasts. */
export const PREMIUM_DAYS = 30;

/** True if the given premiumUntil date represents an active subscription. */
export function isPremiumActive(premiumUntil: Date | null | undefined): boolean {
  return !!premiumUntil && premiumUntil.getTime() > Date.now();
}
