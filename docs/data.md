# Data and architecture

The rules the code relies on for layering, provider data and API handlers. The longer narrative (data flow, caching, observability, deployment order) is in [architecture.md](architecture.md).

## Layering

Layering is strict and one-directional: **provider adapter → service → route/page**. UI and route handlers must never import provider raw types.

- `src/lib/contracts.ts` — the canonical boundary. Zod schemas + inferred types (`Sport`, `Team`, `GameSummary`, `GameSnapshot`, `GameSchedule`, `EvidenceFact`, `Freshness`, `DataMode`). Everything crossing a layer is parsed through these. Sport context is a discriminated union (`soccer` | `baseball`) on `kind`, so adding a sport forces exhaustive handling.
- `src/providers/<vendor>/` — server-only adapter: `client.ts` (fetch, timeouts, bounded response size, typed `ProviderError`), `schemas.ts` (raw vendor Zod), `normalize.ts` (raw → canonical), `provider.ts` (implements `SportsProvider`). Current adapters: `football-data` (soccer), `mlb-stats` + `baseball-savant` (baseball).
- `src/providers/registry.ts` — maps `Sport` → provider. Callers branch on sport, never on vendor name. Adding a provider = new adapter directory + registry entry, no page changes.
- `src/data/sports-data.ts` — the only server-side read/refresh boundary. Provider-neutral: `getTeamSchedule`, `getDashboardData`, `getGameDetail`, `refreshSportData`. Holds the in-process refresh dedupe map and the fallback chain.
- `src/data/sports-repository.ts` — cache reads, the per-provider refresh lease, and atomic multi-table persistence.
- `src/db/` — Drizzle schema (`teams`, `games`, `team_games`, `game_snapshots`, `ingestion_runs`, plus the account/wager/group tables below) plus `client.ts`. **Reads use the Neon HTTP driver; multi-table writes use `withDatabaseTransaction` (Neon WebSocket pool, closed in `finally`).**
- `src/lib/storage.ts` + `src/lib/store.ts` — Zustand store over a single validated `localStorage` key `matchday-plan:v1`, currently `version: 3`. Holds an anonymous ID, first-run tour state (`tourStep`, `introDismissed`), and the buddy's `conversation` uuid. Invalid or future-version data falls back to defaults without crashing. Validation is a hand-written guard (`toStoredState`), not zod: this module is in every page's client bundle, and zod was ~64 KB gzipped there — keep zod out of client components generally (the bet slip and comment thread narrow their own API responses instead of re-parsing them). A field that only needs a default for older payloads (`tourStep`/`introDismissed`, `buddyConversation`) falls back per field inside the guard instead of a version bump — and a _removed_ field needs no bump either, since the guard copies known fields only (this is how the briefing fields left a v3 payload). Bumping `version` is reserved for a field that needs a `migrateLegacy` arm to carry data forward from a removed shape.
- `src/lib/seed.ts` — date-relative demo data, the final fallback and what `MATCHDAY_DATA_MODE=demo` serves.
- `src/components/slate.tsx` (client component, fed a slimmed `BoardData` by `src/app/page.tsx` — no team `context`) — the home page: every tracked team's upcoming games in one list, grouped by day, with sport as a `?sport=soccer|baseball` querystring filter rather than a stored mode. No dashboard, no per-team selection.
- `src/app/you/page.tsx` — the one signed-in surface that answers "where do I stand": balance, record, open wagers, settled history, and record broken out by sport/market. `/account` and `/bets` permanently redirect here via `next.config.ts` `redirects()`, not redirect pages.
- Groups (`src/data/groups.ts`, `src/data/groups-repository.ts`) are a lens on the same one bankroll and one `credit_entries` ledger, not a parallel wallet: `wagers.groupId` decides visibility only. Invites are a `group_invites` row, either emailed (via Resend, when configured) or a shareable link (`email` NULL) created/reused/revoked through `createJoinLink` / `revokeInvite`; accepting is a confirmed `POST`, never a mutation on page load.

## Non-negotiable data rules

- Provider payloads are Zod-validated and normalized before rendering or persistence — never rendered raw.
- Fallback chain, in order: fresh live DB snapshot → expired last-known-good (labelled `stale`) → seeded demo (labelled `demo`). A failed refresh must never overwrite last-known-good JSON. Fixture-context enrichment applies this per source: a source whose pull failed keeps its stored facts with their original `observedAt` (`mergeFacts` in `src/data/fixture-context.ts`), a source that succeeded — even with nothing — replaces its own, and `undefined` (failed) is never collapsed into `[]` (empty).
- Missing data renders "Not provided". Never infer, fabricate, or pad partial schedules with fictional games.
- Freshness `mode` is derived at read time from the stored expiry (`src/data/cache-policy.ts`), not stored. TTLs: team metadata 7 days, schedules/standings 6 hours, game snapshots 1 hour.
- Each provider gets its own ingestion lease (provider/operation/scope), enforced by a partial unique index on `status = 'running'`, so one provider's outage cannot block the other sport.
- Game identity vs. route ID: one stored game per provider game (`football-data-564645`, `mlb-{gamePk}`) associated with both tracked teams; public routes are team-perspective (`mlb-{gamePk}-new-york-yankees`). Session 01 demo route IDs must stay readable — existing browser-local links depend on them.
- Secrets are server-only. Adapters and `src/data/*` import `server-only`.
- Missing `DATABASE_URL` / `FOOTBALL_DATA_API_TOKEN` must not break builds or navigation — degrade to demo and report status via `/api/health`.

## API conventions

Handlers under `src/app/api/`: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `Cache-Control: no-store`. Responses are `{ data }` or `{ error: { code, message, requestId } }` with a `randomUUID()` request ID; error messages never echo configuration. Inputs are parsed with Zod (`limit` constrained 1–10).

Ingestion logs are single-line JSON via `console.info` with `event: "sports_ingestion"` — log operation/scope names, never full URLs with query data.
