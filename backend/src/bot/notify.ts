import { InlineKeyboard } from "grammy";
import { bot } from "./index";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { t, Locale } from "../lib/locale";

/**
 * Bot notification helpers. All copy is localized to the recipient's stored
 * language. Failures are swallowed (e.g. user blocked the bot) so app flows
 * never break because a notification couldn't be delivered.
 */

function openAppButton(locale: Locale, labelKey: string): InlineKeyboard | undefined {
  if (!env.MINI_APP_URL) return undefined;
  return new InlineKeyboard().webApp(t(locale, labelKey), env.MINI_APP_URL);
}

async function send(
  telegramId: bigint,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await bot.api.sendMessage(Number(telegramId), text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[notify] failed to send to", telegramId.toString(), err instanceof Error ? err.message : err);
  }
}

/** Notify a user they have a new match. */
export async function notifyNewMatch(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.newMatch.title")}*\n\n${t(locale, "bot.newMatch.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.newMatch.openButton"));
}

/**
 * Notify a user of a new chat message — only used when they are NOT active
 * in the Mini App (checked by the caller).
 */
export async function notifyNewMessage(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.newMessage.title")}*\n\n${t(locale, "bot.newMessage.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.newMessage.openButton"));
}

/** Notify a user their profile was approved. */
export async function notifyApproved(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.approved.title")}*\n\n${t(locale, "bot.approved.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.approved.openButton"));
}

/** Notify a user their profile was rejected. */
export async function notifyRejected(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.rejected.title")}*\n\n${t(locale, "bot.rejected.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.welcome.openButton"));
}
