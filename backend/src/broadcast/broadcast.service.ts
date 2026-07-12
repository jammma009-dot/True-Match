import { InlineKeyboard, GrammyError } from "grammy";
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

/**
 * A tally of failures grouped by cause, so the admin panel can show a real
 * breakdown ("blocked: 3, rate limited: 1") instead of just the single most
 * recent error string. Every failed send increments exactly one bucket.
 */
export interface BroadcastErrorBreakdown {
  /** User blocked the bot / deactivated / chat not found — not retryable. */
  blocked: number;
  /** Message text wasn't valid Markdown; we successfully retried as plain text. */
  invalidMarkdownRetried: number;
  /** Still failing after honoring Telegram's 429 retry_after up to the cap. */
  rateLimited: number;
  /** Anything else (unexpected Telegram or network error). */
  other: number;
}

export interface BroadcastJob {
  id: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  /** Human-readable reason for the most recent failure, if any (for quick glance). */
  lastError?: string;
  /** Failure counts grouped by cause (for the admin-panel breakdown). */
  errors: BroadcastErrorBreakdown;
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

/** Hard ceiling on how long we'll ever wait for a single recipient across all 429 backoffs. */
const MAX_TOTAL_BACKOFF_MS = 60_000;

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
    errors: { blocked: 0, invalidMarkdownRetried: 0, rateLimited: 0, other: 0 },
  };
  jobs.set(jobId, job);

  void (async () => {
    for (const u of audience) {
      const text = pickMessage(messages, u.language);
      if (!text) {
        job.skipped += 1;
        continue;
      }
      await sendWithRetry(u, text, job);
      await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
    }
    job.status = "done";
    job.finishedAt = Date.now();
  })();

  return { jobId, total: audience.length };
}

/**
 * Send one message, honoring Telegram's 429 ("Too Many Requests") responses
 * and falling back to plain text if the admin's message text isn't valid
 * Markdown (Telegram rejects the *whole* message with a 400 in that case —
 * without this fallback, one stray "_" or "*" in the text would fail 100%
 * of sends).
 *
 * Failure accounting is bucketed by cause on job.errors so the admin panel
 * can show a real breakdown, and the most recent reason is also kept on
 * job.lastError for a quick glance. Non-retryable errors (blocked bot,
 * deleted account, etc.) are counted immediately — retrying wouldn't help.
 *
 * Retry budget notes:
 *  - The Markdown→plaintext fallback does NOT consume a 429 retry attempt;
 *    it just flips the format and re-sends on a fresh attempt.
 *  - 429 backoffs are capped both per-attempt (maxRetries) and in total
 *    wall-clock time (MAX_TOTAL_BACKOFF_MS) so one throttled recipient can
 *    never stall the whole batch.
 */
async function sendWithRetry(
  u: AudienceUser,
  text: string,
  job: BroadcastJob,
  maxRetries = 3,
): Promise<void> {
  let useMarkdown = true;
  let usedPlainTextFallback = false;
  let backoffTotalMs = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await bot.api.sendMessage(Number(u.telegramId), text, {
        ...(useMarkdown ? { parse_mode: "Markdown" as const } : {}),
        reply_markup: ctaButton(u.language),
      });
      job.sent += 1;
      // The send succeeded only because we dropped bad Markdown — surface that
      // as its own bucket so the admin knows their formatting was stripped.
      if (usedPlainTextFallback) job.errors.invalidMarkdownRetried += 1;
      return;
    } catch (err) {
      const description = errorDescription(err);

      if (useMarkdown && /can't parse entities/i.test(description ?? "")) {
        // The message text isn't valid Markdown — retry the SAME recipient as
        // plain text. This doesn't burn a 429 attempt: rewind the counter so
        // the plaintext send gets a full, fresh retry budget of its own.
        useMarkdown = false;
        usedPlainTextFallback = true;
        attempt -= 1;
        continue;
      }

      const retryAfterSec = extractRetryAfter(err);
      if (retryAfterSec != null && attempt < maxRetries) {
        const waitMs = retryAfterSec * 1000 + 250;
        // Honor Telegram's wait, but never blow past the total backoff ceiling.
        if (backoffTotalMs + waitMs <= MAX_TOTAL_BACKOFF_MS) {
          backoffTotalMs += waitMs;
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        // Would exceed our ceiling — give up on this recipient as rate-limited.
        recordFailure(job, "rateLimited", description ?? String(err), u.id);
        return;
      }

      // Terminal for this recipient. Classify it so the breakdown is useful.
      const bucket = classifyFailure(err, retryAfterSec != null);
      recordFailure(job, bucket, description ?? String(err), u.id);
      return;
    }
  }
}

/** Increment the matching failure bucket + overall counter, log, and remember the last reason. */
function recordFailure(
  job: BroadcastJob,
  bucket: keyof BroadcastErrorBreakdown,
  reason: string,
  userId: string,
): void {
  job.failed += 1;
  job.errors[bucket] += 1;
  job.lastError = reason;
  console.error(`[broadcast] send to ${userId} failed [${bucket}]:`, reason);
}

/**
 * Decide which failure bucket an error belongs to. `hitRateLimit` is true when
 * we already saw a 429 for this recipient but exhausted our retries on it.
 */
function classifyFailure(
  err: unknown,
  hitRateLimit: boolean,
): keyof BroadcastErrorBreakdown {
  if (hitRateLimit) return "rateLimited";
  const description = errorDescription(err)?.toLowerCase() ?? "";
  if (
    /blocked by the user|user is deactivated|chat not found|bot was kicked|user not found/.test(
      description,
    )
  ) {
    return "blocked";
  }
  return "other";
}

/** Pull Telegram's human-readable error description out of a grammY error, if present. */
function errorDescription(err: unknown): string | undefined {
  if (err instanceof GrammyError) return err.description;
  return undefined;
}

/** Extract Telegram's `retry_after` (seconds) from a 429 error, if that's what this is. */
function extractRetryAfter(err: unknown): number | null {
  if (err instanceof GrammyError && err.error_code === 429) {
    const retryAfter = err.parameters?.retry_after;
    if (typeof retryAfter === "number") return retryAfter;
  }
  return null;
}
