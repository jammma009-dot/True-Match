# True Match — Build & Deployment Log

A record of building and deploying the **True Match** Telegram Mini App dating
platform (Uzbekistan market), including every issue hit during deployment and
how it was resolved. Secrets are redacted — the real values live in Railway.

---

## 1. What was built

A full MVP Telegram Mini App dating platform, bilingual (Uzbek 🇺🇿 / Russian 🇷🇺),
on free-tier services.

- **Backend** (`/backend`): Node.js + Express + TypeScript, Prisma (Postgres),
  grammy (Telegram bot), Socket.io (real-time chat), Cloudflare R2 (photos).
- **Frontend** (`/frontend`): React + TypeScript + Vite, Tailwind,
  `@telegram-apps/sdk-react`, Zustand, React Query.
- **Auth**: Telegram `initData` validated server-side with HMAC-SHA256 on every request.
- **Features**: `/start` language flow, onboarding wizard, moderation/admin panel,
  swipe/discovery, matches, real-time chat, report/block, 18+ age gate.

---

## 2. Hosting layout

| Piece | Service | Notes |
| --- | --- | --- |
| Backend API + bot + Socket.io | **Railway** | project `adaptable-dedication` |
| Database | **Railway Postgres** | plugin in same project |
| Cache (optional) | **Railway Redis** | plugin in same project |
| Frontend (Mini App) | **Vercel** | `https://true-match.vercel.app` |
| Photo storage | **Cloudflare R2** | bucket `true-match-photos` |
| Bot | **@truematchuzbot** | via BotFather |

Backend URL: `https://true-match-production.up.railway.app`

---

## 3. Deployment journey (chronological)

1. **Code pushed** to branch `feat/mvp-telegram-dating-app`.
2. **Railway project created**, backend service connected to the GitHub repo.
3. **Frontend deployed** to Vercel (root directory = `frontend`,
   `VITE_API_BASE_URL` = backend URL).
4. **Cloudflare R2** bucket created, public access + CORS configured, API token issued.
5. **Bot connected** — `/start` shows language buttons + welcome; Mini App opens.
6. **Full flow verified**: onboarding → photo upload to R2 → profile submitted →
   pending-review screen → admin approval.
7. **Admin "Load sample profiles"** button added to populate the swipe feed.

---

## 4. Issues hit & how they were fixed

These are the real problems encountered during deployment, kept for reference.

### 4.1 Railpack: "could not determine how to build the app"
- **Cause:** monorepo (`backend/` + `frontend/`), no root directory set, so the
  builder saw no project at the repo root.
- **Fix:** Railway → backend service → **Settings → Root Directory = `backend`**, redeploy.

### 4.2 `Environment variable not found: DATABASE_URL`
- **Cause:** Postgres plugin added, but the backend wasn't linked to it.
- **Fix:** Backend service → **Variables** → `DATABASE_URL = ${{Postgres.DATABASE_URL}}`.

### 4.3 Migration failed — `syntax error at or near "┌───┐"` (P3018/P3009)
- **Cause:** the generated `0000_init/migration.sql` had a Prisma CLI "update
  available" banner accidentally captured into it (a `2>&1` redirection bug),
  producing invalid SQL. The failed migration then locked further deploys.
- **Fix:** removed the migrations folder and switched the Railway start command to
  **`npx prisma db push --accept-data-loss && npm run start`**, which builds tables
  directly from `schema.prisma` and ignores migration history.

### 4.4 Build failed — `sh: 1: tsc: not found`
- **Cause:** setting `NODE_ENV=production` made npm skip `devDependencies` during
  the build, so the TypeScript compiler (`tsc`, a devDependency) wasn't installed.
- **Fix:** moved `typescript`, `prisma`, `tsx`, and `@types/*` into `dependencies`,
  added `engines.node >=20` + `.nvmrc` (Node 20), and regenerated `package-lock.json`.

### 4.5 "Open app" button opened `t.me` instead of the app
- **Cause:** `MINI_APP_URL` not set, so the bot used its fallback link.
- **Fix:** deployed the frontend, then set `MINI_APP_URL = https://true-match.vercel.app`
  (use the **stable** Vercel domain, not the per-deploy URL).

### 4.6 Photos wouldn't upload
- **Cause:** Cloudflare R2 wasn't configured yet.
- **Fix:** created the bucket, enabled the **public dev URL**, added a **CORS policy**
  allowing `PUT`/`GET` from the Vercel origin, issued an **Object Read & Write** API
  token, and set the 5 R2 variables on Railway.

---

## 5. Environment variables (redacted)

Set on the **Railway backend service**. Real values are stored in Railway only.

```
# Server
NODE_ENV=production
CORS_ORIGIN=https://true-match.vercel.app   # optional; defaults to allow-all

# Database / cache (Railway plugins)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}              # optional

# Telegram
BOT_TOKEN=<redacted — from BotFather>
BACKEND_URL=https://true-match-production.up.railway.app
MINI_APP_URL=https://true-match.vercel.app
WEBHOOK_SECRET=<redacted>
WELCOME_VIDEO_FILE_ID=<optional — Telegram file_id of demo video>

# Admin panel
ADMIN_PASSWORD=<redacted>

# Cloudflare R2
R2_ACCOUNT_ID=<redacted>
R2_ACCESS_KEY_ID=<redacted>
R2_SECRET_ACCESS_KEY=<redacted>
R2_BUCKET=true-match-photos
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxx.r2.dev
```

**Frontend (Vercel):**
```
VITE_API_BASE_URL=https://true-match-production.up.railway.app
```

---

## 6. Admin panel

- URL: `https://true-match-production.up.railway.app/admin/admin.html`
- Log in with `ADMIN_PASSWORD`.
- **Pending profiles**: approve / reject new signups.
- **Reports**: ban / dismiss reported users.
- **Load sample profiles / Remove samples**: add or clear ~12 test profiles for
  swipe testing.

---

## 7. Current status ✅

- Bot `/start` → language + welcome + Mini App button — **working**
- Mini App opens in Telegram — **working**
- Onboarding + photo upload to R2 — **working**
- Profile submission + pending screen — **working**
- Admin panel + approval — **working**
- Sample profiles button — **added**

---

## 8. Next steps / TODO

- [ ] Approve your own profile in the admin panel to unlock the feed.
- [ ] Click **Load sample profiles** to populate discovery.
- [ ] Test a real **match + chat** using a second Telegram account.
- [ ] (Optional) Add the welcome demo video: set `WELCOME_VIDEO_FILE_ID`.
- [ ] **Security before launch:** rotate the `BOT_TOKEN` (BotFather `/revoke`) and
      the R2 API token, since they were shared during setup. Tighten `CORS_ORIGIN`
      and the R2 CORS `AllowedOrigins` to the exact frontend URL.
- [ ] Remove sample/test profiles before real users join.

---

## 9. Out of scope for this MVP (by design)

- Telegram Stars payments / gifts (gift button is a disabled "coming soon" placeholder)
- Automated photo moderation (`TODO` marker in code)
- GPS distance matching (city-based only)
- Push notifications beyond Telegram bot messages
- Admin analytics dashboards
