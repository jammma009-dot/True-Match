# True Match — Setup & Deployment Guide

This walks you through deploying the whole stack on **free tiers**:

1. [Create the Telegram bot (BotFather)](#1-create-the-telegram-bot)
2. [Set up Railway (backend + Postgres + Redis)](#2-set-up-railway)
3. [Set up Cloudflare R2 (photo storage)](#3-set-up-cloudflare-r2)
4. [Configure backend environment variables](#4-configure-backend-env-vars-on-railway)
5. [Deploy the frontend (Cloudflare Pages / Vercel)](#5-deploy-the-frontend)
6. [Wire the Mini App URL + bot webhook](#6-wire-the-mini-app-url--webhook)
7. [Add the demo welcome video](#7-add-the-demo-welcome-video-optional-but-recommended)
8. [Seed test data & try it](#8-seed-test-data--try-it)
9. [Free-tier limits to watch](#9-free-tier-limits-to-watch)

---

## 1. Create the Telegram bot

1. Open **[@BotFather](https://t.me/BotFather)** in Telegram.
2. Send `/newbot`, follow the prompts. Set the name to **True Match** and pick a
   username ending in `bot` (e.g. `TrueMatchUzBot`).
3. BotFather returns a **bot token** like `123456789:AA...`. Save it — this is
   your `BOT_TOKEN`.
4. (You'll set the Mini App URL later, in step 6, once the frontend is live.)

---

## 2. Set up Railway

Railway hosts the backend **and** provides Postgres + Redis as plugins.

1. Go to **[railway.app](https://railway.app)** and sign in with GitHub.
2. **New Project → Deploy from GitHub repo** → select this repository.
3. Railway will detect the repo. Set the service **Root Directory** to `backend`
   (Settings → Root Directory = `backend`). The included `railway.json` handles
   the build (`npm install && npm run build`) and start
   (`npx prisma migrate deploy && npm run start`) commands.
4. **Add Postgres:** in the project, click **New → Database → Add PostgreSQL**.
   Railway auto-creates a `DATABASE_URL` variable. Reference it from the backend
   service (Variables → add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`).
5. **Add Redis:** **New → Database → Add Redis**. Reference it in the backend
   service as `REDIS_URL` = `${{Redis.REDIS_URL}}`.
6. Under the backend service **Settings → Networking**, click **Generate Domain**.
   Copy the public URL (e.g. `https://true-match-backend.up.railway.app`) — this
   is your `BACKEND_URL`.

> **Migrations:** the start command runs `prisma migrate deploy`, which applies
> migrations from `backend/prisma/migrations`. Generate them once locally before
> your first deploy (see [step 8](#8-seed-test-data--try-it)) and commit them,
> **or** temporarily change the start command to
> `npx prisma db push && npm run start` to create tables without migration files.

---

## 3. Set up Cloudflare R2

R2 stores profile photos (10 GB free, no egress fees).

1. In the **[Cloudflare dashboard](https://dash.cloudflare.com)** → **R2** →
   **Create bucket**. Name it e.g. `true-match-photos`. Note this as `R2_BUCKET`.
2. **Account ID:** shown in the R2 overview / your dashboard URL → `R2_ACCOUNT_ID`.
3. **API token:** R2 → **Manage R2 API Tokens → Create API Token** with
   **Object Read & Write** permission for the bucket. Copy the
   **Access Key ID** (`R2_ACCESS_KEY_ID`) and **Secret Access Key**
   (`R2_SECRET_ACCESS_KEY`).
4. **Public access:** open the bucket → **Settings → Public access** → enable the
   **R2.dev subdomain** (or attach a custom domain). Copy the public base URL,
   e.g. `https://pub-xxxxxxxx.r2.dev` → `R2_PUBLIC_BASE_URL` (no trailing slash).
5. **CORS:** bucket → **Settings → CORS policy** → add a rule allowing browser
   uploads from your frontend origin:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```
   > Tighten `AllowedOrigins` to your real frontend URL before going public.

---

## 4. Configure backend env vars on Railway

In the backend service → **Variables**, set (see `backend/.env.example`):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `BOT_TOKEN` | your BotFather token |
| `BACKEND_URL` | your Railway public URL (from step 2.6) |
| `MINI_APP_URL` | your frontend URL (set after step 5) |
| `WEBHOOK_SECRET` | any random string (e.g. `openssl rand -hex 16`) |
| `ADMIN_PASSWORD` | a strong password for the `/admin` panel |
| `CORS_ORIGIN` | your frontend URL (or `*` while testing) |
| `R2_ACCOUNT_ID` | from step 3 |
| `R2_ACCESS_KEY_ID` | from step 3 |
| `R2_SECRET_ACCESS_KEY` | from step 3 |
| `R2_BUCKET` | `true-match-photos` |
| `R2_PUBLIC_BASE_URL` | from step 3 (no trailing slash) |
| `WELCOME_VIDEO_FILE_ID` | (optional) see step 7 |

Redeploy after setting variables. On boot the backend automatically registers
the Telegram webhook at `{BACKEND_URL}/telegram/webhook/{WEBHOOK_SECRET}`.

---

## 5. Deploy the frontend

Static Vite build → Cloudflare Pages **or** Vercel.

### Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Select this repo. Set:
   - **Root directory / build root:** `frontend`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Environment variables:** add `VITE_API_BASE_URL` = your Railway `BACKEND_URL`.
4. Deploy. Copy the resulting URL (e.g. `https://true-match.pages.dev`).

### Vercel (alternative)
1. **Add New Project** → import the repo → set **Root Directory** to `frontend`.
2. Framework preset: **Vite**. Add env var `VITE_API_BASE_URL` = backend URL.
3. Deploy and copy the URL.

Then go back to **Railway** and set `MINI_APP_URL` (and `CORS_ORIGIN`) to this
frontend URL, and redeploy the backend.

---

## 6. Wire the Mini App URL + webhook

1. **Mini App URL in BotFather:** send `/mybots` → pick your bot →
   **Bot Settings → Menu Button → Configure Menu Button** (or **Web App URL**) →
   paste your frontend URL. This makes the bot's button open the Mini App.
   - Alternatively, the welcome message's inline button already opens
     `MINI_APP_URL` as a `web_app` button — no extra config needed for that.
2. **Webhook:** set automatically on backend boot (see step 4). Verify with:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
   ```
   The `url` should be `{BACKEND_URL}/telegram/webhook/{WEBHOOK_SECRET}`.

Now open your bot in Telegram, send `/start`, pick a language, and tap the button
to launch the Mini App.

---

## 7. Add the demo welcome video (optional but recommended)

The welcome message sends a real Telegram video attachment. To get its `file_id`:

1. Temporarily send your demo video to your bot (or any chat the bot can read),
   or use `@RawDataBot` / `@getidsbot`.
2. Easiest path: send the video to your bot, then call
   `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` and read
   `message.video.file_id` from the JSON.
3. Set `WELCOME_VIDEO_FILE_ID` on Railway to that value and redeploy.

If left empty, the bot sends a **text-only** welcome message with the same
localized caption and button — everything still works.

---

## 8. Seed test data & try it

Run migrations and seed **once** (locally, pointing at the Railway database, or
via a Railway shell):

```bash
cd backend

# First time only: create migration files from the schema and commit them
npx prisma migrate dev --name init

# Seed 10 fake approved profiles so the swipe feed isn't empty
npm run db:seed
```

- Open the **admin panel** at `https://<BACKEND_URL>/admin` and log in with
  `ADMIN_PASSWORD`. Approve your own profile after onboarding to unlock the feed.
- The seeded profiles use `picsum.photos` placeholder images and are already
  `approved`, so they appear in discovery immediately.

---

## 9. Free-tier limits to watch

Everything here has a genuinely usable free tier for ~100–200 test users, but
keep an eye on these ceilings — you'll upgrade later:

- **Railway** — the free/trial plan grants a limited monthly **execution-hour /
  usage credit**. A single always-on backend service plus Postgres + Redis can
  exhaust the monthly credit before month-end. Watch the usage meter; upgrade to
  the Hobby plan when the trial credit runs low.
- **Railway Postgres** — free storage is limited (about **0.5–1 GB**). Fine for
  text data and thousands of users; it's photos (in R2) that would have been the
  problem, and those live elsewhere.
- **Railway Redis** — small free memory allowance. We only use it for daily
  swipe counters and presence flags, which are tiny.
- **Cloudflare R2** — **10 GB** storage and **no egress fees** on the free tier,
  plus monthly Class A/B operation allowances. At ~200 KB/photo and 6 photos/user,
  10 GB covers roughly **8,000+ users**. Watch storage as you grow.
- **Cloudflare Pages / Vercel** — generous static hosting and bandwidth free
  tiers; unlikely to be hit at test scale.
- **Telegram Bot API** — free, but respect the ~**30 messages/second** global
  send limit for notifications if you ever blast many users at once.

### Security reminders before real launch
- Change `ADMIN_PASSWORD` and `WEBHOOK_SECRET` to strong random values.
- Restrict `CORS_ORIGIN` and R2 `AllowedOrigins` to your real frontend URL.
- The admin panel uses a single shared password — fine for a couple of
  moderators, but replace it with proper auth before scaling the team.
