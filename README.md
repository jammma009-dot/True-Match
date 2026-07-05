# True Match 🖤

A **Telegram Mini App dating platform** built for the **Uzbekistan** market. Fast,
convenient dating right inside Telegram — fully bilingual (**Uzbek** 🇺🇿 and
**Russian** 🇷🇺). This is an MVP focused on working end-to-end functionality using
only **free-tier** services.

> The bot / app name is **True Match**.

---

## What it does

- **Bot `/start` flow** — user picks a language, then gets a welcome message
  (demo video + a button that launches the Mini App).
- **Onboarding wizard** — name → birthdate (18+ enforced) → gender → intent →
  city → photos → "under review" screen.
- **Moderation** — every profile starts as `pending`; a simple admin panel
  approves/rejects them. Only approved profiles enter the feed.
- **Swipe / discovery** — card feed with like/pass; mutual likes create a
  **match** and notify both users via the bot.
- **Real-time chat** — 1:1 messaging over Socket.io, persisted to Postgres,
  with bot fallback notifications when a user isn't in the app.
- **Safety** — report users, block users, server-side age gate.

---

## Repository structure

```
True-Match/
├── backend/          Express + TypeScript API, bot, Socket.io, Prisma
│   ├── prisma/       schema.prisma + seed.ts
│   ├── public/       admin.html (minimal moderation panel)
│   ├── src/
│   │   ├── bot/      grammy bot (/start, language, welcome, notifications)
│   │   ├── config/   env loading
│   │   ├── lib/      prisma, redis, r2, locale, ratelimit
│   │   ├── locales/  uz.json / ru.json (bot copy)
│   │   ├── middleware/ auth (initData validation), admin, validate
│   │   ├── routes/   me, profile, photos, discovery, swipe, matches, safety, admin
│   │   ├── services/ messages (shared by REST + socket)
│   │   ├── socket/   Socket.io chat
│   │   ├── utils/    age, cities, serialize
│   │   └── index.ts  server entry (HTTP + webhook + socket)
│   ├── railway.json  Railway deploy config
│   └── .env.example
│
├── frontend/         Vite + React + TypeScript Mini App
│   ├── src/
│   │   ├── components/ ui, BottomNav, ReportBlockModal
│   │   ├── i18n/      uz.json / ru.json (UI copy) + translate()
│   │   ├── lib/       telegram, api, socket
│   │   ├── screens/   onboarding/, Discover, Matches, Chat, Likes, Profile, ...
│   │   ├── store/     zustand store
│   │   └── App.tsx    root routing
│   └── .env.example
│
├── SETUP.md          step-by-step deploy instructions
└── README.md
```

---

## How the pieces connect

```
┌─────────────┐        initData (HMAC-validated)         ┌──────────────────────┐
│  Telegram   │  ───────────────────────────────────▶    │   Railway backend      │
│  Mini App   │        REST + Socket.io                   │  Express + grammy      │
│ (frontend)  │  ◀───────────────────────────────────    │  + Socket.io           │
└─────────────┘                                           │                        │
      │  direct upload (presigned PUT)                    │  ┌── Postgres (Railway) │
      ▼                                                   │  ├── Redis (Railway)    │
┌─────────────┐                                           │  └── bot webhook        │
│ Cloudflare  │                                           └──────────┬─────────────┘
│     R2      │                                                      │
└─────────────┘                                            ┌─────────▼─────────┐
                                                            │  Telegram Bot API │
                                                            └───────────────────┘
```

- **Auth** is entirely Telegram `initData`, validated server-side with
  HMAC-SHA256 on **every** request. No passwords, no third-party auth.
- **Photos** are uploaded straight from the browser to **Cloudflare R2** using
  presigned URLs the backend issues — bytes never pass through the server.
- **The same Express server** also hosts the Socket.io chat and the Telegram
  **bot webhook**, so there's a single deployable backend service.

---

## Local development

See **[SETUP.md](./SETUP.md)** for full deploy instructions. To run locally:

```bash
# Backend
cd backend
cp .env.example .env          # fill in BOT_TOKEN + DATABASE_URL at minimum
npm install
npx prisma migrate dev        # create tables
npm run db:seed               # add 10 fake profiles
npm run dev                   # starts API + bot (long polling in dev)

# Frontend (separate terminal)
cd frontend
cp .env.example .env          # set VITE_API_BASE_URL=http://localhost:8080
npm install
npm run dev
```

> The Mini App only fully works when opened **inside Telegram** (it needs
> `initData`). Use a tunneling tool (e.g. `cloudflared`, `ngrok`) to expose the
> frontend and set it as your bot's Mini App URL for real testing.

---

## Tech stack

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | React + TypeScript + Vite, Tailwind, `@telegram-apps/sdk-react`, Zustand, React Query |
| Backend    | Node.js + Express + TypeScript, grammy, Prisma                    |
| Database   | PostgreSQL (Railway)                                              |
| Cache      | Redis (Railway) — swipe rate limiting, presence                  |
| Media      | Cloudflare R2 (presigned uploads)                                |
| Real-time  | Socket.io (same Express server)                                  |
| Hosting    | Backend → Railway · Frontend → Cloudflare Pages / Vercel         |

---

## Out of scope for this MVP

- Telegram Stars payments / gifts / boosts (gift button is a disabled "coming soon" placeholder)
- Automated photo moderation (a `TODO` marks where it plugs in — see `backend/src/routes/photos.ts` and the `Photo` model)
- GPS distance matching (city-based matching only)
- Push notifications beyond Telegram bot messages
- Admin analytics dashboards
