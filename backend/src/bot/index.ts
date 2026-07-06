import { Bot, InlineKeyboard } from "grammy";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { t, Locale, normalizeLocale } from "../lib/locale";
import { PREMIUM_DAYS, BOOST_DAYS, stackedBoostUntil } from "../lib/premium";
import { createMatchAndCelebrate } from "../services/match";

/**
 * grammy bot instance. Handles the pre-Mini-App /start flow:
 *  1. Ask the user to choose a language (two stacked inline buttons).
 *  2. Persist the chosen language against their Telegram ID immediately.
 *  3. Send a welcome message with a demo video + a web_app button that
 *     launches the Mini App.
 *
 * All copy comes from the uz.json / ru.json locale dictionaries.
 */
export const bot = new Bot(env.BOT_TOKEN || "MISSING_TOKEN");

/** Build the language-choice keyboard (one button per row). */
function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(t("uz", "bot.lang.uz"), "lang:uz")
    .row()
    .text(t("uz", "bot.lang.ru"), "lang:ru");
}

/** Build the "open Mini App" keyboard. */
function openAppKeyboard(locale: Locale): InlineKeyboard {
  // web_app buttons require an https URL; fall back to a t.me link if unset.
  if (env.MINI_APP_URL) {
    return new InlineKeyboard().webApp(
      t(locale, "bot.welcome.openButton"),
      env.MINI_APP_URL,
    );
  }
  return new InlineKeyboard().url(
    t(locale, "bot.welcome.openButton"),
    "https://t.me",
  );
}

/** Ensure a minimal user row exists for this Telegram ID. */
async function ensureUser(
  telegramId: number,
  languageCode?: string,
  username?: string,
) {
  const id = BigInt(telegramId);
  return prisma.user.upsert({
    where: { telegramId: id },
    update: { username: username ?? null },
    create: {
      telegramId: id,
      username: username ?? null,
      language: normalizeLocale(languageCode),
    },
  });
}

// ---------- /start ----------
bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  await ensureUser(from.id, from.language_code, from.username);

  await ctx.reply(t("uz", "bot.chooseLanguage"), {
    reply_markup: languageKeyboard(),
  });
});

// ---------- Language selection callback ----------
bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
  const locale = (ctx.match?.[1] as Locale) ?? "uz";
  const from = ctx.from;
  if (!from) return;

  // Persist language immediately.
  await prisma.user.update({
    where: { telegramId: BigInt(from.id) },
    data: { language: locale },
  });

  await ctx.answerCallbackQuery({ text: t(locale, "bot.langSaved") });

  // Remove the language prompt, then send the welcome message.
  try {
    await ctx.deleteMessage();
  } catch {
    /* ignore if it can't be deleted */
  }

  await sendWelcome(ctx.chat!.id, locale);
});

/**
 * Send the welcome message: demo video (if configured) + localized caption +
 * a web_app button that opens the Mini App.
 */
export async function sendWelcome(chatId: number, locale: Locale): Promise<void> {
  const caption = t(locale, "bot.welcome.caption");
  const keyboard = openAppKeyboard(locale);

  if (env.WELCOME_VIDEO_FILE_ID) {
    // Send the demo video as an actual Telegram video attachment.
    await bot.api.sendVideo(chatId, env.WELCOME_VIDEO_FILE_ID, {
      caption,
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } else {
    // No video configured yet — send text-only welcome.
    // TODO: set WELCOME_VIDEO_FILE_ID once the demo video is uploaded.
    await bot.api.sendMessage(chatId, caption, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

// ---------- Telegram Stars payments (Premium) ----------

// Approve every pre-checkout query (digital goods are always "in stock").
bot.on("pre_checkout_query", async (ctx) => {
  try {
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bot] pre_checkout answer failed:", err);
  }
});

/** Notify the configured Star recipient (numeric id only) about a purchase. */
async function notifyStarRecipient(text: string): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const recipient = settings?.starRecipient?.trim();
  if (recipient && /^\d+$/.test(recipient)) {
    await bot.api.sendMessage(Number(recipient), text).catch(() => undefined);
  }
}

// On successful payment, apply Premium or a Boost (present).
bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  const payload = payment?.invoice_payload ?? "";

  // ----- Premium: premium:<userId> -----
  const premiumMatch = /^premium:(.+)$/.exec(payload);
  if (premiumMatch) {
    const userId = premiumMatch[1];
    const until = new Date(Date.now() + PREMIUM_DAYS * 86_400_000);
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { premiumUntil: until },
      });
      const locale = user.language as Locale;
      await ctx
        .reply(`*${t(locale, "bot.premium.title")}*\n\n${t(locale, "bot.premium.body")}`, {
          parse_mode: "Markdown",
          reply_markup: openAppKeyboard(locale),
        })
        .catch(() => undefined);
      await notifyStarRecipient(
        `New Premium purchase: ${payment.total_amount} ⭐ (user ${userId}).`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[bot] failed to activate premium:", err);
    }
    return;
  }

  // ----- Boost / Present: boost:<targetUserId>:<buyerUserId> -----
  const boostMatch = /^boost:([^:]+):(.+)$/.exec(payload);
  if (boostMatch) {
    const targetUserId = boostMatch[1];
    const buyerUserId = boostMatch[2];
    const isGift = targetUserId !== buyerUserId;
    try {
      const target = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!target) return;
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
        await ctx
          .reply(`*${t(bl, "bot.boost.title")}*\n\n${t(bl, key)}`, {
            parse_mode: "Markdown",
            reply_markup: openAppKeyboard(bl),
          })
          .catch(() => undefined);
      }

      // If it's a gift, open a chat with a highlighted "sent you a gift" first
      // message (no need to wait for a like back), and notify the recipient.
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

      await notifyStarRecipient(
        `New ${isGift ? "Present (gift)" : "Boost"} purchase: ${payment.total_amount} ⭐ (buyer ${buyerUserId} → ${targetUserId}).`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[bot] failed to apply boost:", err);
    }
    return;
  }
});

// Basic error logging.
bot.catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[bot] error:", err.error);
});
