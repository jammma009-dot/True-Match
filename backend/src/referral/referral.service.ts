import { bot } from "../bot";
import { prisma } from "../lib/prisma";
import { t, Locale } from "../lib/locale";
import { stackedBoostUntil } from "../lib/premium";

/**
 * ---------------------------------------------------------------------------
 * Referral program (NEW, isolated feature).
 *
 * Each user gets a personal invite link: https://t.me/<bot>?start=ref_<code>,
 * where <code> is their own Telegram ID base36-encoded (no extra DB column or
 * migration needed to generate/store a code — it's fully deterministic and
 * already unique, since telegramId is unique).
 *
 * Flow:
 *   1. A brand-new user opens the bot via that link → bot/index.ts calls
 *      captureReferral() once, at account creation, recording who invited them.
 *   2. Once that new user's profile is APPROVED by an admin, routes/admin.ts
 *      calls rewardReferrerIfEligible() → the referrer gets +1 day of Boost
 *      (stacked on any remaining boost time) and a bot notification.
 *      Rewarding only on approval (not on raw signup) avoids abuse from fake
 *      / incomplete signups.
 *
 * This file only imports existing helpers (bot, prisma, locale, premium) and
 * doesn't modify any of them — nothing else in the codebase imports from this
 * file except the two small, additive hooks in bot/index.ts and
 * routes/admin.ts, and the new referral.routes.ts.
 * ---------------------------------------------------------------------------
 */

/** How many days of Boost the referrer earns per approved friend. */
export const REFERRAL_BOOST_DAYS = 1;

/** Encode a Telegram user id as a short base36 referral code. */
function encodeRef(telegramId: bigint): string {
  return telegramId.toString(36);
}

/** Decode a referral code back into a Telegram user id, or null if invalid. */
function decodeRef(code: string): bigint | null {
  if (!/^[0-9a-z]+$/i.test(code)) return null;
  try {
    const n = code
      .toLowerCase()
      .split("")
      .reduce((acc, ch) => acc * 36n + BigInt(parseInt(ch, 36)), 0n);
    return n > 0n ? n : null;
  } catch {
    return null;
  }
}

// Cached bot username (fetched once, lazily) so we don't call getMe() on
// every single link-building request.
let cachedBotUsername: string | null = null;
async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = await bot.api.getMe();
    cachedBotUsername = me.username ?? null;
    return cachedBotUsername;
  } catch {
    return null;
  }
}

/** Build this user's personal invite link, or null if the bot username isn't known yet. */
export async function buildReferralLink(telegramId: bigint): Promise<string | null> {
  const username = await getBotUsername();
  if (!username) return null;
  return `https://t.me/${username}?start=ref_${encodeRef(telegramId)}`;
}

/**
 * Called once, right after a brand-new user is created by the /start
 * handler. Parses the `ref_<code>` deep-link payload (if any), looks up the
 * referrer, and records the relationship. No-ops silently on anything
 * invalid (missing payload, self-referral, unknown code) — referrals are a
 * bonus, never something that should block onboarding.
 */
export async function captureReferral(
  newUserId: string,
  newUserTelegramId: bigint,
  startPayload: string | undefined,
): Promise<void> {
  if (!startPayload) return;
  const match = /^ref_([0-9a-z]+)$/i.exec(startPayload.trim());
  if (!match) return;

  const referrerTelegramId = decodeRef(match[1]);
  if (!referrerTelegramId || referrerTelegramId === newUserTelegramId) return;

  const referrer = await prisma.user.findUnique({
    where: { telegramId: referrerTelegramId },
  });
  if (!referrer) return;

  await prisma.user
    .update({
      where: { id: newUserId },
      data: { referredById: referrer.id },
    })
    .catch(() => undefined);
}

/**
 * Called after a profile is approved. If that user was referred by someone
 * and the referrer hasn't been rewarded for them yet, grants +1 day of Boost
 * to the referrer (stacked on any remaining boost) and notifies them.
 */
export async function rewardReferrerIfEligible(approvedUserId: string): Promise<void> {
  const approvedUser = await prisma.user.findUnique({ where: { id: approvedUserId } });
  if (!approvedUser?.referredById || approvedUser.referralRewardGranted) return;

  const referrer = await prisma.user.findUnique({ where: { id: approvedUser.referredById } });
  if (!referrer) return;

  const boostUntil = stackedBoostUntil(referrer.boostUntil, REFERRAL_BOOST_DAYS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: referrer.id }, data: { boostUntil } }),
    prisma.user.update({
      where: { id: approvedUser.id },
      data: { referralRewardGranted: true },
    }),
  ]);

  const locale = referrer.language as Locale;
  await bot.api
    .sendMessage(
      Number(referrer.telegramId),
      `*${t(locale, "bot.referral.rewardedTitle")}*\n\n${t(locale, "bot.referral.rewardedBody")}`,
      { parse_mode: "Markdown" },
    )
    .catch(() => undefined);
}

export interface ReferralSummary {
  link: string | null;
  approvedCount: number;
  pendingCount: number;
}

/** Everything the Mini App's referral card/modal needs for one user. */
export async function getReferralSummary(userId: string, telegramId: bigint): Promise<ReferralSummary> {
  const [link, referrals] = await Promise.all([
    buildReferralLink(telegramId),
    prisma.user.findMany({
      where: { referredById: userId },
      select: { referralRewardGranted: true },
    }),
  ]);

  const approvedCount = referrals.filter((r) => r.referralRewardGranted).length;
  const pendingCount = referrals.length - approvedCount;

  return { link, approvedCount, pendingCount };
}
