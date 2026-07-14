import { InlineKeyboard } from "grammy";
import { bot } from "../bot";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { t, Locale } from "../lib/locale";
import { PREMIUM_DAYS, BOOST_DAYS, stackedBoostUntil } from "../lib/premium";
import { createMatchAndCelebrate } from "./match";

/**
 * Shared entitlement-granting logic used by BOTH payment paths:
 *   1. Telegram Stars — the bot's `successful_payment` handler.
 *   2. Card-to-card — the CardXabar webhook (routes/payments.ts) after a
 *      matching transfer is detected by the userbot.
 *
 * Keeping this in one place guarantees a card payment behaves identically to a
 * Stars payment (same durations, same notifications, same gift chat).
 */

/** "Open Mini App" keyboard (omitted when no Mini App URL is configured). */
function openAppKeyboard(locale: Locale): InlineKeyboard | undefined {
  if (!env.MINI_APP_URL) return undefined;
  return new InlineKeyboard().webApp(
    t(locale, "bot.welcome.openButton"),
    env.MINI_APP_URL,
  );
}

/**
 * Grant (or extend from now) a Premium subscription and notify the user.
 * `days` selects which purchased plan's period to apply (defaults to the
 * legacy 30-day period when not specified, e.g. for old/unlabeled orders).
 * Returns the new expiry, or null if the user doesn't exist.
 */
export async function grantPremium(
  userId: string,
  days: number = PREMIUM_DAYS,
): Promise<Date | null> {
  const until = new Date(Date.now() + days * 86_400_000);
  let user;
  try {
    user = await prisma.user.update({
      where: { id: userId },
      data: { premiumUntil: until },
    });
  } catch {
    return null;
  }

  const locale = user.language as Locale;
  await bot.api
    .sendMessage(
      Number(user.telegramId),
      `*${t(locale, "bot.premium.title")}*\n\n${t(locale, "bot.premium.body")}`,
      { parse_mode: "Markdown", reply_markup: openAppKeyboard(locale) },
    )
    .catch(() => undefined);

  return until;
}

/**
 * Apply a Boost/Present to `targetUserId` (stacking on any remaining time) and
 * notify the buyer. When it's a gift (target !== buyer) also open a chat with a
 * highlighted "sent you a gift" first message and notify the recipient.
 * Returns true on success, false if the target doesn't exist.
 */
export async function grantBoost(
  targetUserId: string,
  buyerUserId: string,
): Promise<boolean> {
  const isGift = targetUserId !== buyerUserId;

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) return false;

  // Stack the boost on top of any remaining time.
  const boostUntil = stackedBoostUntil(target.boostUntil, BOOST_DAYS);
  await prisma.user.update({
    where: { id: targetUserId },
    data: { boostUntil },
  });

  // Thank the buyer.
  const buyer = await prisma.user.findUnique({ where: { id: buyerUserId } });
  if (buyer) {
    const bl = buyer.language as Locale;
    const key = isGift ? "bot.present.sent" : "bot.boost.body";
    await bot.api
      .sendMessage(
        Number(buyer.telegramId),
        `*${t(bl, "bot.boost.title")}*\n\n${t(bl, key)}`,
        { parse_mode: "Markdown", reply_markup: openAppKeyboard(bl) },
      )
      .catch(() => undefined);
  }

  // Gift: open a chat with a highlighted first message + notify the recipient.
  if (isGift) {
    await createMatchAndCelebrate(buyerUserId, targetUserId, {
      gift: { fromUserId: buyerUserId },
    }).catch(() => undefined);

    const tl = target.language as Locale;
    await bot.api
      .sendMessage(
        Number(target.telegramId),
        `*${t(tl, "bot.present.title")}*\n\n${t(tl, "bot.present.body")}`,
        { parse_mode: "Markdown", reply_markup: openAppKeyboard(tl) },
      )
      .catch(() => undefined);
  }

  return true;
}
