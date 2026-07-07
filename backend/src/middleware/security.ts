import { Request, Response, NextFunction } from "express";
import { isProd } from "../config/env";

/**
 * Baseline security response headers for the API + admin panel.
 *
 * Kept dependency-free and deliberately conservative so it can't break the
 * cross-origin Mini App → API calls (CORS governs those) or the inline-script
 * admin panel (no CSP is imposed here). These headers only add protections:
 *   - nosniff:        stop MIME-type sniffing
 *   - X-Frame-Options: the API/admin must never be framed (clickjacking)
 *   - Referrer-Policy: don't leak URLs/tokens via Referer
 *   - HSTS (prod):     force HTTPS for a year
 *   - Permissions-Policy: disable powerful features we never use
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()",
  );
  if (isProd) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains",
    );
  }
  next();
}
