# 🏰 Scholar's Kingdom

A gamified, AI-powered learning world for Grades 6–12. Study with AI tutors,
earn Kingdom Coins, and plant real GPS territory on a shared world map —
**1 coin = 1 m² of land**.

## Tech stack

- **Next.js 16** (App Router) · TypeScript 5 · Tailwind CSS 4 · shadcn/ui
- **Prisma ORM** + SQLite
- **Leaflet** + CARTO basemaps
- **z-ai-web-dev-sdk** (server-side Gemini tutors)
- Google Sign-In + Phone OTP (session cookies)

## Local setup

```bash
# 1. install dependencies
bun install

# 2. configure environment — copy the example and add YOUR OWN values
cp .env.example .env
#   → set DATABASE_URL and your own NEXT_PUBLIC_CARTO_KEY (free at carto.com)

# 3. create the database schema
bun run db:push

# 4. run
bun run dev
```

Then open the app, sign in with any phone number (dev OTP shows as a toast),
pick your country/grade/subjects — and your kingdom is founded.

## 🔐 Security note

This repository intentionally contains **no credentials**:

- `.env` is git-ignored — use `.env.example` as the template.
- The SQLite database is git-ignored — it holds real accounts/phone numbers.
  Run `bun run db:push` to generate a fresh empty one.

If you fork/clone this repo, you need your own CARTO API key for basemap tiles
and your own deployment of the AI tutor SDK.
