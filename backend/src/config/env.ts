import dotenv from "dotenv";

dotenv.config();

/**
 * Centralised environment access. We read lazily and provide sensible
 * defaults where safe. Required-at-runtime values are validated in
 * assertRequiredEnv() which is called on boot.
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "8080", 10),

  DATABASE_URL: process.env.DATABASE_URL ?? "",
  REDIS_URL: process.env.REDIS_URL ?? "",

  // Telegram
  BOT_TOKEN: process.env.BOT_TOKEN ?? "",
  // Public base URL of THIS backend (used for the webhook)
  BACKEND_URL: process.env.BACKEND_URL ?? "",
  // Deployed frontend Mini App URL (opened via web_app button)
  MINI_APP_URL: process.env.MINI_APP_URL ?? "",
  // Secret path/token used to secure the Telegram webhook
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? "true-match-webhook",
  // Telegram file_id of the demo video sent in the welcome message (optional).
  // If empty, the welcome message is sent without a video.
  WELCOME_VIDEO_FILE_ID: process.env.WELCOME_VIDEO_FILE_ID ?? "",

  // Admin panel
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "changeme",

  // Cloudflare R2 (S3-compatible)
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "",
  // Public base URL for the bucket (R2 public dev URL or custom domain)
  R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL ?? "",

  // CORS: comma-separated list of allowed origins (frontend URL). "*" allows all.
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "*",
};

export const isProd = env.NODE_ENV === "production";

/**
 * Fails fast on boot if critical env vars are missing in production.
 */
export function assertRequiredEnv(): void {
  const required: Array<[string, string]> = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["BOT_TOKEN", env.BOT_TOKEN],
  ];

  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Missing recommended env vars: ${missing.join(", ")}. ` +
        `The server will start but related features will not work.`,
    );
  }
}
