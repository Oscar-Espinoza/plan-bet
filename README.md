# Matchday Plan

Matchday Plan is a public sports preparation workspace for scanning upcoming games, reviewing source-backed context, keeping a browser-local watchlist, and saving recaps without an account.

The current checkpoint is **Session 02: database and live soccer**. Real Madrid and FC Barcelona use validated football-data.org data backed by PostgreSQL; expired provider data falls back to the last-known-good snapshot and then to an explicitly labelled demo. Yankees and Red Sox remain date-relative demo data until Session 03.

**Live demo:** [plan-bet.vercel.app](https://plan-bet.vercel.app)

## Product surface

- Real Madrid and Barcelona schedules, La Liga standings, and last-five form through football-data.org
- PostgreSQL-backed cache with live, stale, and demo freshness labels
- Date-relative seeded Yankees and Red Sox fallback data
- Sport-specific game pages with source timestamps and evidence-linked deterministic briefs
- Browser-local watchlist CRUD, filters, recap notes, saved briefs, and activity totals
- Responsive, keyboard-accessible desktop and mobile workspace

There is no login. Personal state never leaves the browser and uses only `matchday-plan:v1`.

## Stack

Next.js 16.2, React 19.2, TypeScript 6, Tailwind CSS 4, Zod 4, Zustand 5, PostgreSQL 18 on Neon, Drizzle ORM, the Neon serverless driver, Vitest, Testcontainers, and Playwright. Exact versions are pinned in `package.json` and `pnpm-lock.yaml`; the project targets Node 24.18.1 and pnpm 11.

## Local setup

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set these server-only variables in `.env.local`:

```dotenv
DATABASE_URL=postgresql://...
FOOTBALL_DATA_API_TOKEN=...
```

Apply the generated migration and idempotent team seed before starting the app:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Missing secrets do not break builds or navigation: soccer returns the Session 01 demo fallback and `/api/health` reports the unavailable dependency without exposing configuration values.

## APIs and data policy

| Route                                         | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| `GET /api/teams`                              | Four configured canonical teams                       |
| `GET /api/teams/:slug/games?limit=5`          | Validated canonical schedule and team context         |
| `GET /api/games/:gameId`                      | Canonical game snapshot, evidence, and source records |
| `GET /api/health`                             | App, database, and provider configuration status      |
| `/`, `/games/[id]`, `/watchlist`, `/activity` | Public product workflow                               |

Provider payloads are validated before normalization or persistence. Team metadata is cached for seven days, schedules and standings for six hours, and near-game snapshots for one hour. Reads use fresh live data first, expired last-known-good data second, and demo data only when no valid database snapshot exists. Partial live schedules are never padded with fictional games.

Provider game identities are stored once and associated with both tracked teams when necessary. Team-perspective route IDs remain stable, and all Session 01 demo game routes remain readable for existing browser-local items.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

`pnpm test:integration` starts and removes an isolated PostgreSQL 18 Docker container; it never uses `DATABASE_URL`. Playwright starts the production build in deterministic demo mode so the browser suite runs without provider or database network access.

## Current limitations

- Baseball remains explicitly seeded until Session 03.
- Injury and player-availability information is shown as “Not provided” because this integration does not source it.
- Briefings are deterministic evidence templates, not live AI; grounded AI generation arrives in Session 04.
- No betting, predictions, odds, notifications, live play-by-play, social features, or cross-device synchronization.

## Roadmap

1. **Session 03:** MLB Stats API baseball adapter through the shared canonical contracts
2. **Session 04:** quota-limited structured AI briefings grounded in saved evidence
3. **Session 05:** scheduled refresh, system view, CI, accessibility hardening, and portfolio handoff
