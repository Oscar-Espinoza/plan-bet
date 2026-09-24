# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Matchday Plan (repo `plan-bet`): a Next.js 16 App Router workspace for practicing wager calls on real upcoming fixtures for four teams (Real Madrid, Barcelona, Yankees, Red Sox), with source-backed context, sign-in-gated accounts, and a free-to-play wager simulator on fictional credits. Deployed at plan-bet.vercel.app.

Work is planned as numbered sessions in `docs/implementation/` (gitignored) covering sessions 01–10: 01–05 the original browsing workspace (03 workspace core; 04 grounded AI briefings via OpenAI Responses API — **removed**, see the Buddy section for the surviving AI surface; 05 scheduled refresh, `/api/cron/refresh`, CI, a11y), 06–09 the wager simulator milestone (06 accounts and credit ledger, 07 result ingestion and the fixed house price table — 07b replaced an earlier odds-API plan, there is no odds feed — 08 placing and locking a wager, 09 settlement, history, and record), 10 groups. A later redesign (lettered phases A–C, shipped; cross-cutting first-run polish) is recorded in the planning tool's own plan file, not in `docs/implementation/` — read the relevant session file, or the plan, before changing behavior each covers.

## Commands

```bash
pnpm dev
pnpm build && pnpm start

# quality gate — all must pass before any deploy/commit of a session
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && pnpm test:e2e && pnpm test:fixtures

pnpm test -- src/data/sports-data.test.ts     # single unit test file
pnpm test -- -t "falls back"                  # single test by name
pnpm test:integration                         # spins up a PostgreSQL 18 Testcontainer; needs Docker, ignores DATABASE_URL
pnpm test:e2e -- --grep "wager"               # Playwright; builds+starts prod server in forced demo mode

pnpm db:generate   # drizzle-kit generate after editing src/db/schema.ts
pnpm db:migrate
pnpm db:seed       # idempotent team seed
pnpm data:refresh:soccer   # manual provider refresh (needs DATABASE_URL + real tokens)
pnpm data:refresh:baseball
```

Node 24.18.1 / pnpm 11 are pinned in `engines`. Scripts load `.env.local` via `--env-file-if-exists`.

## Architecture

Layering is strict and one-directional: **provider adapter → service → route/page**. UI and route handlers must never import provider raw types.

- `src/lib/contracts.ts` — the canonical boundary. Zod schemas + inferred types (`Sport`, `Team`, `GameSummary`, `GameSnapshot`, `GameSchedule`, `EvidenceFact`, `Freshness`, `DataMode`). Everything crossing a layer is parsed through these. Sport context is a discriminated union (`soccer` | `baseball`) on `kind`, so adding a sport forces exhaustive handling.
- `src/providers/<vendor>/` — server-only adapter: `client.ts` (fetch, timeouts, bounded response size, typed `ProviderError`), `schemas.ts` (raw vendor Zod), `normalize.ts` (raw → canonical), `provider.ts` (implements `SportsProvider`), `__fixtures__/` (sanitized payloads; all tests run without network). Current adapters: `football-data` (soccer), `mlb-stats` + `baseball-savant` (baseball).
- `src/providers/registry.ts` — maps `Sport` → provider. Callers branch on sport, never on vendor name. Adding a provider = new adapter directory + registry entry, no page changes.
- `src/data/sports-data.ts` — the only server-side read/refresh boundary. Provider-neutral: `getTeamSchedule`, `getDashboardData`, `getGameDetail`, `refreshSportData`. Holds the in-process refresh dedupe map and the fallback chain.
- `src/data/sports-repository.ts` — cache reads, the per-provider refresh lease, and atomic multi-table persistence.
- `src/db/` — Drizzle schema (`teams`, `games`, `team_games`, `game_snapshots`, `ingestion_runs`, plus the account/wager/group tables below) plus `client.ts`. **Reads use the Neon HTTP driver; multi-table writes use `withDatabaseTransaction` (Neon WebSocket pool, closed in `finally`).**
- `src/lib/storage.ts` + `src/lib/store.ts` — Zustand store over a single validated `localStorage` key `matchday-plan:v1`, currently `version: 3`. Holds an anonymous ID, first-run tour state (`tourStep`, `introDismissed`), and the buddy's `conversation` uuid. Invalid or future-version data falls back to defaults without crashing. A field that only needs a default for older payloads (`tourStep`/`introDismissed`, `buddyConversation`) is added with `.catch().default()` instead of a version bump — and a _removed_ field needs no bump either, since zod strips unknown keys (this is how the briefing fields left a v3 payload). Bumping `version` is reserved for a field that needs a `migrateLegacy` arm to carry data forward from a removed shape.
- `src/lib/seed.ts` — date-relative demo data, the final fallback and the source of truth for Playwright's deterministic mode.
- `src/components/slate.tsx` (server component) — the home page: every tracked team's upcoming games in one list, grouped by day, with sport as a `?sport=soccer|baseball` querystring filter rather than a stored mode. No dashboard, no per-team selection.
- `src/app/you/page.tsx` — the one signed-in surface that answers "where do I stand": balance, record, open wagers, settled history, and record broken out by sport/market. `/account` and `/bets` permanently redirect here via `next.config.ts` `redirects()`, not redirect pages.
- Groups (`src/data/groups.ts`, `src/data/groups-repository.ts`) are a lens on the same one bankroll and one `credit_entries` ledger, not a parallel wallet: `wagers.groupId` decides visibility only. Invites are a `group_invites` row, either emailed (via Resend, when configured) or a shareable link (`email` NULL) created/reused/revoked through `createJoinLink` / `revokeInvite`; accepting is a confirmed `POST`, never a mutation on page load.

### Non-negotiable data rules

- Provider payloads are Zod-validated and normalized before rendering or persistence — never rendered raw.
- Fallback chain, in order: fresh live DB snapshot → expired last-known-good (labelled `stale`) → seeded demo (labelled `demo`). A failed refresh must never overwrite last-known-good JSON.
- Missing data renders "Not provided". Never infer, fabricate, or pad partial schedules with fictional games.
- Freshness `mode` is derived at read time from the stored expiry (`src/data/cache-policy.ts`), not stored. TTLs: team metadata 7 days, schedules/standings 6 hours, game snapshots 1 hour.
- Each provider gets its own ingestion lease (provider/operation/scope), enforced by a partial unique index on `status = 'running'`, so one provider's outage cannot block the other sport.
- Game identity vs. route ID: one stored game per provider game (`football-data-564645`, `mlb-{gamePk}`) associated with both tracked teams; public routes are team-perspective (`mlb-{gamePk}-new-york-yankees`). Session 01 demo route IDs must stay readable — existing browser-local links depend on them.
- Secrets are server-only. Adapters and `src/data/*` import `server-only`; tests alias it to `src/test/server-only.ts`.
- Missing `DATABASE_URL` / `FOOTBALL_DATA_API_TOKEN` must not break builds or navigation — degrade to demo and report status via `/api/health`.

### Wager simulator rules (Sessions 06–09, implemented)

- Wagers are append-only. No status column, no `updated_at`, no update or delete path. State is derived from whether a `credit_entries` row of kind `return` exists for that wager, the same way freshness is derived from stored expiry.
- Balance is the sum of an append-only credit ledger, never a stored column.
- Settlement inserts once (`credit_entries_wager_return_uidx`, a partial unique index on `wager_id where kind = 'return'`, conflict-do-nothing) so a repeated run cannot pay twice, and is decided by the provider result feed alone — via `gradeSelection` in `src/lib/markets.ts` — never by the language model.
- There is no separate `settlements` table. The `return` credit_entries row **is** the settlement record (`outcome` + `settlement_run_id` columns, null on every other kind); a second table would only duplicate what the unique index above already guarantees atomically.
- Settlement (`src/data/settlement.ts`, `POST /api/cron/settle`) reuses `ingestion_runs` for its lease and run record — `provider = "settlement"`, `operation = "settle"`, `scope = "all"` — rather than a bespoke lease table, the same partial-unique-on-`running` index that guards provider refreshes.
- The price shown at placement is re-read server-side, frozen into the wager, and never recalculated. A client-supplied price is never trusted.
- **The only limit on a stake is the balance**, summed from the ledger and checked inside the placement transaction (`src/data/wagers.ts`) before any row is written. `MAX_STAKE` in `src/lib/markets.ts` is not a product cap: it is the int4 column bound, derived as `INT4_MAX / HIGHEST_PRICE` so a maximum return still fits `wagers.potential_return`. `contracts.ts` repeats it as a literal because it cannot import `markets.ts` without a cycle; `markets.test.ts` asserts the two still agree. Typing over the balance warns and disables Place rather than rewriting the entered value.
- A market is only placeable when both a cached price and a stored result field that grades it exist. Corners, cards, and assists are not gradable from current providers and are not offered — a known, permanent gap, not a TODO.
- There is no `push` outcome. Every published line ends in `.5` (`soccer-total-2-5`, `baseball-total-8-5`), so a push cannot arise; `Grade` is `won | lost | void` only.
- Wagers key on the canonical game ID (`football-data-564645`, `mlb-{gamePk}`), not the team-perspective route ID, so one real game is not counted twice.
- Prices are fixed house prices published by this app (`src/lib/markets.ts`), identical for every game of a sport and never recomputed from a vendor feed — never licensed from a sportsbook. There is no odds API.
- `src/data/wagers.ts` (placement) + `src/data/wagers-repository.ts` (reads) + `src/data/settlement.ts` (grading). `pg_advisory_xact_lock` classids 3–7 are taken (3 credit reset, 4 wager placement, 5 group invites — creating/reusing a join link, revoking, accepting, 6 buddy session quota, 7 buddy IP quota); 1 and 2 were the briefing quotas and are free again, but the next feature needing one claims classid 8 rather than reusing them.

### Buddy (Phase E, E1.1, implemented)

The only consumer of the grounded-generation spine (`src/lib/buddy-prompt.ts`, `src/lib/buddy-validation.ts`, `src/providers/openai/client.ts`) now that the briefing feature is gone — the spine's shared helpers `TIME_TOKEN` and `neutralize` moved into `buddy-prompt.ts`, and the hash/UTC-day quota helpers into `buddy-repository.ts`. **The client sends only a route string; the server derives every fact from it** (`src/data/buddy.ts:resolveContext`) — the client never supplies a fact, a name, a statistic, or a price. Group membership and account ownership are re-checked in the data layer on every turn, never trusted from the request. Five contexts: a game's evidence facts and placeable markets, `/you`'s own record slices (signed in only), a group's leaderboard (membership re-checked), `recall` — every upcoming fixture with built context, nearest kickoff first (`listBoardContext` in `src/data/fixture-context-repository.ts`, capped at `RECALL_FIXTURES` = 12; the whole board fits in one prompt, so no retrieval) — for any other route once a database is configured, or `none` — nothing invented, the reply points at the board instead. `none` is `recall`'s own empty case too: no database, or nothing built yet.

It streams plain prose, not Structured Outputs — a streamed structured response can't be validated until it's complete, so grounding runs on the accumulated text instead. `[fact-id]` markers must all resolve against the supplied facts; an optional trailing `[pick: <marketId>:<selectionId>]` is dropped, not rejected, if it doesn't resolve against `marketsFor(sport)`. **On `response.completed` the server validates the whole reply and, if it fails, retracts it** — the terminal SSE frame carries `{ ok: false }` and the client replaces the streamed text outright, never leaving an ungrounded sentence standing because it already appeared on screen. The buddy may only ever _name_ a selection this way; it never places one. **The `[fact-id]` markers are the proof of grounding, not part of the voice**: `parseBuddyReply` strips them out of the displayed `prose` (the reader never sees a bracket), while `factIds` still carries them into the audit trail unchanged.

**The facts are what the buddy thinks with, not what it says.** A normal reply recites nothing back — no standings, no table positions, no stat quoting, no naming a source — it reads the facts, forms a take, and gives the take in two or three sentences, in the register of a friend in a group chat, mirroring the reader's tone (mild profanity included) once they set it first. Only when the reader asks why, where that came from, or how it knows does it lay the facts out, still in voice, still no brackets. It never says "guaranteed"/"lock"/"sure thing", never states a percentage or probability, and never mentions real money, a bookmaker, or a sportsbook. Disagreeing out loud is the job — mocking the _pick_ — but mocking the _person_ never is: no insults about who someone is, and nothing touching a protected characteristic, enforced as a prohibited-language pattern rather than left to the prompt alone. Datetime facts are withheld and referenced by `{time}`, but the validator deliberately does **not** reject a written date — a two-sentence chat next to a page already showing the kickoff would treat any mention of a day as a retraction trigger.

`OPENAI_API_KEY` missing short-circuits before any quota is claimed and returns a deterministic, per-fact reply with no lean. `DATABASE_URL` missing degrades to unmetered, unlogged, and without memory. Neither breaks a build or a page. Turns are stored append-only in `buddy_messages` (one row per turn, keyed on a client-held `conversation` uuid) with daily quotas on classids 6/7 (30 per session, 100 per IP, per UTC day).

**Memory.** The buddy can end a reply with a trailing `[note: ...]` marker (after any `[pick: ...]`), parsed in the same pass, capped at 120 chars, dropped silently if malformed — a note-to-self about how the reader talks (register, club, running joke), never a personal detail it wasn't handed. Stored append-only in `buddy_notes` (migration `0008`, no update path, no advisory lock); `listBuddyNotes` reads the freshest six back into the prompt as untrusted `- known: ...` lines inside `<user_reference>`, and `saveBuddyNote` skips a note already stored verbatim for that session. `DELETE /api/buddy` ("Forget what you know about me") clears a session's notes.

The floating trigger (`.buddy-launcher`, fixed bottom-right, z-40) sits beside `<TourBar />`, not in the topbar — it raises above the first-run tour bar while that's showing and always clears `.mobile-nav`.

### API conventions

Handlers under `src/app/api/`: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `Cache-Control: no-store`. Responses are `{ data }` or `{ error: { code, message, requestId } }` with a `randomUUID()` request ID; error messages never echo configuration. Inputs are parsed with Zod (`limit` constrained 1–10).

Ingestion logs are single-line JSON via `console.info` with `event: "sports_ingestion"` — log operation/scope names, never full URLs with query data.

### UI

**Matchcentre.** A club website compressed onto a phone: near-black ground, slat panels, hairline rules, flat square surfaces, and **the club colour of the fixture you are looking at as the page accent**. Values and surface rules live in `docs/design/matchcentre-tokens.md`; what changed from the previous design, and its traps, in `docs/design/matchcentre-migration.md`. Palette families: ink/slat (ground and panels), chalk/muted/faint (text), rules, field/clay (settled outcomes), and the three club tokens below.

The accent is per-page and comes from data: `--club` (a filled surface), `--club-on` (text on that fill) and `--club-lit` (the colour as text on the ground) are derived in `src/lib/club-accent.ts` from `team.colors.primary` and written as inline custom properties on `.board` and `.mp` by the server. Nothing else sets them; a page with no fixture falls back to neutral chalk. **An edge, rule or ring takes `--club-lit`; only a filled surface with text on it takes `--club` + `--club-on`.** `club-accent.test.ts` recomputes every contrast ratio for every configured team, so a changed seed colour fails the suite — seed colours themselves are canonical and are never edited.

The accent does identity and time — crest rings, the tracked-side stripe, the painted fixture row, the countdown, block titles, the armed selection. It never does money: balances, stakes, prices and returns stay chalk and mono, with field/clay only on a settled outcome. The primary action is chalk on every page, so one control does not look like four. Archivo headings uppercase, IBM Plex Sans body, DM Mono with tabular numerals on every figure. Nothing rounded (both radius tokens are `0`), no gradients, glass, glow, chat bubbles or sparkles, and nothing sheared or clipped.

`AppShell` owns the action bar and its portal targets; route components own their content and state. The bar exists on a game page only — the board ends at the nav — and carries returns, the stake and its chips, and the place button; the stake stays associated with the panel's form by id, so native validation and Enter are unchanged. The board's countdown lives in the next-match card. Mobile shell rows are workspace, action bar, navigation; above 1024px the nav moves into the header and the bar pins itself (that rule must sit beside the base rule, not in the shell's earlier 1024 block). `ResizeObserver` measures `--nav-h`, `--action-h` and `--tour-h` for overlay offsets and content clearance; only the bottommost visible band adds safe-area padding. Below 640px every panel runs edge to edge: `.main-content` keeps its 1rem gutter so loose text stays inset, and the panels cancel it with `margin-inline: -1rem` plus no side borders — net width unchanged, so nothing overflows. `src/components/pitch-art.tsx` draws the playing surface (pitch or diamond, keyed on sport) behind the board hero and the scorebug, under a flat `--ink` scrim rather than a gradient; layer order is art, crest, scrim, type, and type needs its own `z-index` or the scrim greys it out. Fixture rows are one line — game, kickoff, chevron — with both names sharing the width and each carrying its own ellipsis; competition and venue live in the hero and on the matchup. Dates render in the browser timezone via `local-date-time.tsx`. Fictional credits remain non-withdrawable; prices and markets come from the existing house table.

Out of scope, revised: **suggestions are permitted when they run on fictional credits, are grounded in cited evidence, and are never framed as advice about real-money wagering** — this is what a future buddy feature is allowed to be. Still out, no exception: real-money betting, notifications, live play-by-play, social feeds/reactions, RAG/vector search, cross-device sync of browser-local state.

### Testing

- `vitest.config.ts` — jsdom, `src/**/*.test.{ts,tsx}`, excludes integration.
- `vitest.integration.config.ts` — node, `*.integration.test.ts` only, serial, 120s timeouts, real PostgreSQL container.
- `playwright.fixtures.config.ts` — isolated Vite app with real UI/CSS, mocked navigation, controlled accounts and intercepted requests; `pnpm test:fixtures` checks client interactions, shell geometry and axe. Server behavior remains covered by integration tests.
- `playwright.config.ts` — starts `pnpm start` with `DATABASE_URL= FOOTBALL_DATA_API_TOKEN= MATCHDAY_DATA_MODE=demo` for determinism; set `PLAYWRIGHT_BASE_URL` to run against a deployment instead. Browser assertions must accept live/stale/demo freshness so they pass in both modes.

### Skills

When a task requires an unfamiliar specialist capability, repeated domain
guidance, or a reusable workflow, first use find-skills to look for a
well-maintained skill. Do not search for skills for ordinary implementation,
bug fixes, or when an installed skill already covers the task.
Before installing any third-party skill, show the source, purpose, install
count/reputation, and proposed install command, and wait for approval.
