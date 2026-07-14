import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { normalizeLocale, Locale } from "../lib/locale";
import type { User } from "@prisma/client";

/**
 * Parsed Telegram user object from initData.
 */
export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

// Extend Express Request with our authenticated context.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: User;
      tgUser?: TelegramUser;
      locale?: Locale;
    }
  }
}

/**
 * Validate Telegram Mini App initData using the documented HMAC-SHA256 algorithm.
 *
 *   secret_key    = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   computed_hash = HMAC_SHA256(key = secret_key,   message = data_check_string)
 *
 * data_check_string is all fields except `hash`, sorted by key, joined by "\n"
 * as "key=value". Returns the parsed fields if valid, otherwise null.
 *
 * We NEVER trust any user id sent by the client outside of this validation.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 24 * 60 * 60,
): Record<string, string> | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  // Build data-check-string
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key === "hash") return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // secret_key = HMAC-SHA256("WebAppData" as key? no) — key is bot token message
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // Constant-time compare
  const valid =
    computedHash.length === hash.length &&
    crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(hash, "hex"),
    );

  if (!valid) return null;

  // Freshness check on auth_date
  const authDate = Number(params.get("auth_date"));
  if (authDate) {
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds > maxAgeSeconds) return null;
  }

  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Extract initData from a request. The frontend sends it either in the
 * `Authorization: tma <initData>` header or the `x-telegram-init-data` header.
 */
function extractInitData(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth && auth.toLowerCase().startsWith("tma ")) {
    return auth.slice(4).trim();
  }
  const custom = req.header("x-telegram-init-data");
  if (custom) return custom;
  return null;
}

/**
 * Auth middleware — validates initData on EVERY request (not just login),
 * loads/creates the user row, and attaches it to req.authUser.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const initData = extractInitData(req);
    if (!initData) {
      res.status(401).json({ error: "missing_init_data" });
      return;
    }

    const parsed = verifyInitData(initData, env.BOT_TOKEN);
    if (!parsed) {
      res.status(401).json({ error: "invalid_init_data" });
      return;
    }

    let tgUser: TelegramUser | null = null;
    if (parsed.user) {
      try {
        tgUser = JSON.parse(parsed.user) as TelegramUser;
      } catch {
        tgUser = null;
      }
    }
    if (!tgUser?.id) {
      res.status(401).json({ error: "no_user_in_init_data" });
      return;
    }

    // Upsert a minimal user. Usually created already by the /start bot flow,
    // but this keeps the app robust if the Mini App is opened first.
    const telegramId = BigInt(tgUser.id);
    const username = tgUser.username ?? null;
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          username,
          language: normalizeLocale(tgUser.language_code),
        },
      });
    } else if (user.username !== username) {
      // Keep the stored username fresh (users can change it in Telegram).
      user = await prisma.user.update({
        where: { id: user.id },
        data: { username },
      });
    }

    if (user.isBanned) {
      res.status(403).json({ error: "banned" });
      return;
    }

    req.authUser = user;
    req.tgUser = tgUser;
    req.locale = user.language as Locale;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth] error:", err);
    res.status(500).json({ error: "auth_failed" });
  }
}
