import { InlineKeyboard } from "grammy";
import { Gender, ProfileStatus, Language, City } from "@prisma/client";
import { bot } from "../bot";
import { prisma } from "../lib/prisma";
import { t, Locale } from "../lib/locale";
import { isPremiumActive } from "../lib/premium";
import { env } from "../config/env";

/**
 * ---------------------------------------------------------------------------
 * Broadcast module (NEW, isolated feature).
 *
 * Lets the admin panel send a one-off message + "Open True Match" call-to-
 * action button to a filtered slice of users (all / male / female / premium /
 * free / by profile status / by language / by city / banned or not).
 *
 * This file is 100% additive: it only imports existing helpers (bot, prisma,
 * locale, premium, env) and does not modify any of them. Nothing else in the
 * codebase imports from this file, so it cannot break any existing route,
 * bot handler, or page.
 * ---------------------------------------------------------------------------
 */

export interface BroadcastFilters {
  /** "all" | "male" | "female" */
  gender?: "all" | Gender;
  /** "all" | "premium" (active Premium) | "free" (no active Premium) */
  premium?: "all" | "premium" | "free";
  /** Profile moderation status. "all" includes users without a profile too. */
  status?: "all" | ProfileStatus;
  /** Recipient's stored bot language. "all" = both. */
  language?: "all" | Language;
  /** Restrict to one Uzbekistan city, or "all". */
  city?: "all" | City;
  /** "exclude" (default, recommended) | "only" (banned users only) | "all" */
  banned?: "exclude" | "only" | "all";
  /** "all" | "yes" (has a profile) | "no" (/start only, no profile yet) */
  hasProfile?: "all" | "yes" | "no";
}

export interface BroadcastMessages {
  /** Message body shown to users whose language is Uzbek. */
  uz?: string;
  /** Message body shown to users whose language is Russian. */
  ru?: string;
}

interface AudienceUser {
  id: string;
  telegramId: bigint;
  language: Locale;
}

/** Build the Prisma where-clause for the given filters (premium is derived, applied afterwards). */
function buildWhere(filters: BroadcastFilters) {
  const where: Record<string, unknown> = {};

  if (filters.banned === "only") {
    where.isBanned = true;
  } else if (filters.banned !== "all") {
    // Default: never message banned/deactivated accounts.
    where.isBanned = false;
  }

  if (filters.language && filters.language !== "all") {
    where.language = filters.language;
  }

  const profileWhere: Record<string, unknown> = {};
  if (filters.gender && filters.gender !== "all") profileWhere.gender = filters.gender;
  if (filters.status && filters.status !== "all") profileWhere.status = filters.status;
  if (filters.city && filters.city !== "all") profileWhere.city = filters.city;

  if (filters.hasProfile === "no") {
    where.profile = null;
  } else if (filters.hasProfile === "yes" || Object.keys(profileWhere).length > 0) {
    where.profile = { is: profileWhere };
  }

  return where;
}

/** Resolve the exact list of recipients (id / telegramId / language) for the given filters. */
export async function resolveAudience(filters: BroadcastFilters): Promise<AudienceUser[]> {
  const where = buildWhere(filters);
  const users = await prisma.user.findMany({
    where,
    select: { id: true, telegramId: true, language: true, premiumUntil: true },
  });

  let list = users;
  if (filters.premium === "premium") {
    list = list.filter((u) => isPremiumActive(u.premiumUntil));
  } else if (filters.premium === "free") {
    list = list.filter((u) => !isPremiumActive(u.premiumUntil));
  }

  return list.map((u) => ({
    id: u.id,
    telegramId: u.telegramId,
    language: (u.language as Locale) ?? "uz",
  }));
}

/** Just the count — used by the admin panel's "Preview audience" button. */
export async function countAudience(filters: BroadcastFilters): Promise<number> {
  const list = await resolveAudience(filters);
  return list.length;
}

/**
 * The call-to-action button, localized to the recipient. Reuses the exact
 * same copy as the /start welcome message ("True Match'ni ochish" /
 * "Открыть True Match") so the tone stays consistent, but is built locally
 * here rather than importing from bot/notify.ts, so that file stays untouched.
 */
function ctaButton(locale: Locale): InlineKeyboard {
  const label = t(locale, "bot.welcome.openButton");
  if (env.MINI_APP_URL) {
    return new InlineKeyboard().webApp(label, env.MINI_APP_URL);
  }
  return new InlineKeyboard().url(label, "https://t.me");
}

/** Pick the right message body for a recipient's language, falling back to the other one if blank. */
function pickMessage(messages: BroadcastMessages, locale: Locale): string {
  if (locale === "ru") return (messages.ru?.trim() || messages.uz?.trim() || "");
  return (messages.uz?.trim() || messages.ru?.trim() || "");
}

export type JobStatus = "running" | "done";

export interface BroadcastJob {
  id: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
}

// In-memory job tracker. Good enough for an admin-only, single-instance MVP
// tool; jobs disappear on restart, which is fine since they're short-lived
// progress indicators, not persisted data.
const jobs = new Map<string, BroadcastJob>();

export function getJob(id: string): BroadcastJob | undefined {
  return jobs.get(id);
}

/** Delay between individual sends. Keeps well under Telegram's ~30 msg/sec global cap. */
const SEND_DELAY_MS = 45;

/**
 * Resolve the audience, then start sending in the background. Returns
 * immediately once the audience is known (fast DB query) so the admin panel
 * gets an accurate total right away; actual delivery continues async and is
 * tracked via getJob(jobId).
 */
export async function startBroadcast(
  filters: BroadcastFilters,
  messages: BroadcastMessages,
): Promise<{ jobId: string; total: number }> {
  const audience = await resolveAudience(filters);

  const jobId = `bc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: BroadcastJob = {
    id: jobId,
    total: audience.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    status: "running",
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);

  void (async () => {
    for (const u of audience) {
      const text = pickMessage(messages, u.language);
      if (!text) {
        job.skipped += 1;
        continue;
      }
      try {
        await bot.api.sendMessage(Number(u.telegramId), text, {
          parse_mode: "Markdown",
          reply_markup: ctaButton(u.language),
        });
        job.sent += 1;
      } catch {
        // User blocked the bot, deleted their account, etc. Never let one
        // failure stop the rest of the batch.
        job.failed += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }
    job.status = "done";
    job.finishedAt = Date.now();
  })();

  return { jobId, total: audience.length };
}
