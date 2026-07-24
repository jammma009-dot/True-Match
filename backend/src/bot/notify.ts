import { InlineKeyboard } from "grammy";
import type { User } from "@prisma/client";
import { bot } from "./index";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { t, Locale } from "../lib/locale";

/**
 * Bot notification helpers. All copy is localized to the recipient's stored
 * language. Failures are swallowed (e.g. user blocked the bot, or the DB is
 * momentarily unreachable/overloaded) so app flows never break because a
 * notification couldn't be delivered.
 */

/** Minimal shape these helpers actually need. */
type NotifyUser = Pick<User, "id" | "telegramId" | "language">;

/**
 * Callers can pass either a user id (we'll look it up) OR an already-loaded
 * user object (e.g. `req.authUser`, or a `target` they just fetched for
 * another check). Passing the object skips a redundant DB round-trip — these
 * helpers are fired with `void` on hot paths like every swipe, so avoiding
 * extra connection-pool pressure there matters under load.
 */
type NotifyTarget = string | NotifyUser;

async function resolveUser(target: NotifyTarget): Promise<NotifyUser | null> {
  if (typeof target !== "string") return target;
  try {
    return await prisma.user.findUnique({
      where: { id: target },
      select: { id: true, telegramId: true, language: true },
    });
  } catch (err) {
    // DB hiccup (e.g. connection pool exhausted) — never let a notification
    // lookup throw into an unhandled rejection on a fire-and-forget call.
    // eslint-disable-next-line no-console
    console.warn(
      "[notify] failed to look up user",
      target,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

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
export async function notifyNewMatch(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.newMatch.title")}*\n\n${t(locale, "bot.newMatch.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.newMatch.openButton"));
}

/**
 * Notify a user of a new chat message — only used when they are NOT active
 * in the Mini App (checked by the caller).
 */
export async function notifyNewMessage(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.newMessage.title")}*\n\n${t(locale, "bot.newMessage.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.newMessage.openButton"));
}

/** Notify a user that someone liked their profile (identity not revealed). */
export async function notifyNewLike(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.newLike.title")}*\n\n${t(locale, "bot.newLike.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.newLike.openButton"));
}

/** Notify a user their profile was approved. */
export async function notifyApproved(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.approved.title")}*\n\n${t(locale, "bot.approved.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.welcome.openButton"));
}

/** Notify a user their profile was rejected. */
export async function notifyRejected(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.rejected.title")}*\n\n${t(locale, "bot.rejected.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.welcome.openButton"));
}

/** Notify a user that Premium was activated for them (e.g. admin granted it). */
export async function notifyPremiumGranted(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.premium.title")}*\n\n${t(locale, "bot.premium.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.welcome.openButton"));
}

/** Notify a user that a Boost was activated for them (e.g. admin granted it). */
export async function notifyBoostGranted(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.boost.title")}*\n\n${t(locale, "bot.boost.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.welcome.openButton"));
}

/** Notify a user their profile photo was verified (blue check). */
export async function notifyVerified(target: NotifyTarget): Promise<void> {
  const user = await resolveUser(target);
  if (!user) return;
  const locale = user.language as Locale;
  const text = `*${t(locale, "bot.verified.title")}*\n\n${t(locale, "bot.verified.body")}`;
  await send(user.telegramId, text, openAppButton(locale, "bot.welcome.openButton"));
}
