import express from "express";
import cors from "cors";
import { createServer } from "http";
import path from "path";
import { webhookCallback } from "grammy";

import { env, assertRequiredEnv, isProd } from "./config/env";
import { securityHeaders } from "./middleware/security";
import { bot } from "./bot";
import { initSocket } from "./socket";

import meRouter from "./routes/me";
import profileRouter from "./routes/profile";
import photosRouter from "./routes/photos";
import discoveryRouter from "./routes/discovery";
import swipeRouter from "./routes/swipe";
import matchesRouter from "./routes/matches";
import likesRouter from "./routes/likes";
import safetyRouter from "./routes/safety";
import adminRouter from "./routes/admin";
import premiumRouter from "./routes/premium";
import paymentsRouter from "./routes/payments";

// Make BigInt JSON-serialisable as a safety net (we avoid returning it, but
// this prevents accidental 500s if one ever leaks into a response).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function main(): Promise<void> {
  assertRequiredEnv();

  const app = express();
  app.set("trust proxy", true);
  // Don't advertise the framework/version.
  app.disable("x-powered-by");

  // Baseline security headers on every response.
  app.use(securityHeaders);

  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Health check (used by Railway).
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // ---------- Telegram webhook ----------
  // Secured by a secret path segment. Set the webhook to:
  //   {BACKEND_URL}/telegram/webhook/{WEBHOOK_SECRET}
  app.use(
    `/telegram/webhook/${env.WEBHOOK_SECRET}`,
    webhookCallback(bot, "express"),
  );

  // ---------- API routes ----------
  app.use("/api/me", meRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/photos", photosRouter);
  app.use("/api/discovery", discoveryRouter);
  app.use("/api/swipe", swipeRouter);
  app.use("/api/matches", matchesRouter);
  app.use("/api/likes", likesRouter);
  app.use("/api/premium", premiumRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api", safetyRouter); // /api/report, /api/block, /api/unblock
  app.use("/api/admin", adminRouter);

  
  // ---------- Minimal admin panel (static HTML) ----------
  app.use("/admin", express.static(path.resolve(process.cwd(), "public")));

  // 404 fallback for unknown API routes.
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

  // ---------- HTTP + Socket.io ----------
  const server = createServer(app);
  initSocket(server);

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  // ---------- Bot: webhook (prod) or long polling (dev) ----------
  if (env.BOT_TOKEN) {
    if (env.BACKEND_URL) {
      const url = `${env.BACKEND_URL.replace(/\/$/, "")}/telegram/webhook/${env.WEBHOOK_SECRET}`;
      try {
        await bot.api.setWebhook(url, { drop_pending_updates: true });
        // eslint-disable-next-line no-console
        console.log(`[bot] webhook set to ${url}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[bot] failed to set webhook:", err);
      }
    } else if (!isProd) {
      // Local dev without a public URL — use long polling.
      await bot.api.deleteWebhook({ drop_pending_updates: true }).catch(() => undefined);
      void bot.start({
        onStart: () => console.log("[bot] long polling started (dev)"),
      });
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[fatal]", err);
  process.exit(1);
});
