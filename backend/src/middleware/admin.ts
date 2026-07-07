import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env";

/**
 * Timing-safe string compare (avoids leaking the password length/prefix via
 * response-time differences).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Minimal admin auth for the MVP: a shared password sent as a Bearer token in
 * the Authorization header (or `x-admin-password`). Good enough for a couple of
 * moderators; replace with real auth before scaling.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.header("authorization");
  const headerPw = req.header("x-admin-password");
  let provided: string | null = null;

  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    provided = auth.slice(7).trim();
  } else if (headerPw) {
    provided = headerPw;
  }

  if (!provided || !env.ADMIN_PASSWORD || !safeEqual(provided, env.ADMIN_PASSWORD)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}
