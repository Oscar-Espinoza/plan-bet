# Cloudflare migration log

Spec: [cloudflare-migration-spec.md](cloudflare-migration-spec.md).

## How this run is executed

- Builders run headless through the Cursor CLI (`cursor-agent -p`), one git worktree per ticket under `/home/oscar/Projects/plan-bet-wt/`. Grok 4.7 (`grok-4.7-high`) builds even tickets; Composer 2.5 (`composer-2.5`) builds odd tickets. GLM and DeepSeek were the first choice but are not included in the Cursor plan; Oscar chose the included models.
- The coordinator (Claude Opus 5.5, Claude Code session) writes each ticket plan to `.cursor/plans/Txx.md`, reviews the result, sends findings back to the same builder chat, and merges into `cf/main` after review passes. Oscar asked for the run to continue without per-ticket approval; production (T15) still waits for Oscar.
- Bugbot and Agent Review are not used in this headless run; the coordinator's review plus a fresh-context reviewer on Tier A tickets replace them.

## Builder scorecard

| Ticket | Tier | Builder      | Plan followed | Gate loops | Review rounds | Blocker / major / minor | Invariant breaks | SvelteKit 2 slips | Invented APIs | Sandbox | Outcome        | Wall time | Cost     |
| ------ | ---- | ------------ | ------------- | ---------- | ------------- | ----------------------- | ---------------- | ----------------- | ------------- | ------- | -------------- | --------- | -------- |
| T00    | B    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 0               | 0                | 0                 | 0             | clean   | PASS           | 21.5 min  | included |
| T01    | B    | Composer 2.5 | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS           | 2.8 min   | included |
| T02    | A    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 2               | 0                | 0                 | 0             | clean   | PASS           | 19.8 min  | included |
| T03    | B    | Composer 2.5 | yes           | 0          | 2             | 1 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS (round 2) | 25.4 min  | included |

## Coordinator notes

- T00 review (Opus): gate re-run `CHECK OK 5015ec1`; legacy demo build passes; preview health healthy (D1 `select 1` 172 ms from the São Paulo edge to the ENAM primary). Grok's note is correct: adapter-cloudflare 8 passes no `platform` to `server.respond`, so bindings come from `import { env } from "cloudflare:workers"` (and `waitUntil` from the same module). Later plans use that instead of `platform.env`/`platform.ctx`.

- T01 review (Opus): gate `CHECK OK 05a8e61`; every verbatim port diffs clean against legacy except the planned `PUBLIC_SITE_URL` line in `email.ts`; both JSON files byte-identical; no runtime zod/node/server import in `src/lib/shared`. Minor: `api-response.ts` dropped the `ApiSuccess`/`ApiFailure` body types when moving to `Response` (no behaviour change).

- T02 review (Opus): gate `CHECK OK d11226d`; fresh local migrate applies 0000 + 0001; schema dump matches legacy tables, onDelete rules and enum CHECKs; independently confirmed with SQL: one `grant 1000 signup` per user via trigger, second grant rejected, second `return` rejected and `ON CONFLICT (wager_id) WHERE kind='return'` is a no-op, duplicate `running` lease rejected, duplicate idempotency key rejected. Good catch by Grok: legacy grant reason is `signup`. Minor: Better Auth's `user.name`/`user.email` are NOT NULL while legacy allowed null; T14's transform must default them. Minor: fixture-context merge in `getGameDetail` deferred; added to T03's plan.

- T03 review (Opus): round 1 BLOCK — the enrich RPC failed and surfaced as a hung Worker (500 from the cron route). Composer's round 2 found the cause: a Drizzle `sql` fragment in `dueWork` that D1 rejected (fixed with `or(isNull, lt)`, same semantics as legacy) plus a throw across the RPC boundary; it also cleared abort timers and made the cron routes return the legacy error envelope. Re-verified: enrich 200 twice, refresh 200 (baseball succeeded, soccer skipped: no football token on the preview), `board:v1` published. Minor: bearer cron POSTs need `Content-Type: application/json` under SvelteKit 3 CSRF; Workers cron uses RPC so nothing depends on it.

## Tickets

## T00 Bootstrap and guardrails — 2026-11-03 — PASS

Branch / PR: cf/T00-bootstrap / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 22 scaffold files changed, plus the Next app moved into `legacy/` (moves and the lockfile are outside the size cap) Pieces: 8
Ported from: none. T00 moves the Next app; it does not port behaviour.
Deviations from legacy: none inside `legacy/`. The demo build did not need a source edit.
Deviations from the plan:

- The guard hook blocks any command containing `DATABASE_URL=`. `DATABASE_URL` was already unset, so the legacy build was `MATCHDAY_DATA_MODE=demo pnpm --dir legacy build`.
- `/api/health` reads `platform.env.DB` and, when `platform` is missing, `env.DB` from `cloudflare:workers`. adapter-cloudflare 8's worker calls `server.respond` without a `platform` argument (`files/worker.js`). The adapter documents bindings on that module. Without the fallback the preview D1 binding looks missing.
- `src/cloudflare-workers.d.ts` declares that module. A `declare module` inside `app.d.ts` is invisible to TypeScript because that file is itself a module.
- Prettier and ESLint also ignore `.cursor/`, `.codex/`, and `docs/cloudflare-migration-spec.md`. The plan forbids editing those, and the spec is not Prettier-clean. Prettier did realign the empty scorecard separator in this file so `format:check` passes. No scorecard row was added.
- pnpm 11 added `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` for packages younger than its release-age policy.
- `drizzle/.gitkeep` exists so wrangler's `migrations_dir` is present. Sqlite migrations are T02.
- `package.json` `imports` maps `#lib/*`, which SvelteKit 3 requires. Nothing imports it yet.
- zod 4.6.7, drizzle-orm 0.45.4, and drizzle-kit 0.31.11 were looked up and not installed. No T00 code imports them. TypeScript is 6.0.3 (latest 6.x; `typescript-eslint` and `svelte-check` reject 7). ESLint is 9.39.5 because the plan asks for ESLint 9.
- `workers/jobs` is omitted, as this plan says. Spec Appendix H's jobs wrangler file waits for T03.

Moved top-level entries: `.claude`, `.env.example`, `.github`, `.gitignore`, `.nvmrc`, `.prettierignore`, `PERFORMANCE.md`, `README.md`, `drizzle`, `drizzle.config.ts`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `postcss.config.mjs`, `prettier.config.mjs`, `public`, `scripts`, `src`, `tsconfig.json`, `vercel.json`. Left at the root: `.cursor`, `.codex`, `AGENTS.md`, `DESIGN.md`, `PRODUCT.md`, `docs`.

Preview: https://matchday-preview.jolyyjhon.workers.dev
Version: d36d5403-591b-4a03-b8be-60a582f192c5
Health: `{"data":{"status":"healthy","database":{"status":"healthy","durationMs":174}}}` with `cache-control: no-store`.
`/` renders `Matchday Plan — migration in progress`.
TTFB `/` (10x `time_starttransfer`, seconds): 0.551126, 0.569712, 0.512264, 0.488000, 0.502364, 0.476899, 0.499324, 0.487670, 0.492253, 0.527974. Median 0.500844.
TTFB `/api/health`: 0.628718, 0.605447, 0.617586, 0.632390, 0.572412, 0.604764, 0.616356, 0.643534, 0.633224, 0.617778. Median 0.617682.
Guard: `wrangler deploy --dry-run` without `--env preview` was denied with "Blocked: Deploys must use --env preview; production deploys are Oscar's."

Acceptance:

- `pnpm check` → `CHECK OK 3cd59a6` (that was HEAD before this commit; `scripts/check-ok.mjs` prints the current short sha, so a re-run on this commit prints this commit).
- `MATCHDAY_DATA_MODE=demo pnpm --dir legacy build` → Next.js 16.3.6 compiled successfully.
- Preview `/api/health` → `database.status` `healthy`.
- `legacy/` holds the Next app. The root holds the SvelteKit app plus `.cursor`, `.codex`, `AGENTS.md`, `DESIGN.md`, `PRODUCT.md`, and `docs`.

Budgets touched: `/` first-load JS gzip 30854 bytes (limit 61440). `/games/[id]` n/a. `/` TTFB median 0.500844 s on the workers.dev preview. The ≤ 60 ms figure is the edge-cache-hit budget on the custom domain (§1); this ticket does not add that cache (T04).
Review: gate CHECK OK 3cd59a6 before commit; verifier, auditor, agent review, and bugbot not run (coordinator).
FOLLOWUPS: none

## T01 Shared domain port — 2026-11-03 — PASS

Branch / PR: cf/T01-domain / (not opened) Models: plan Claude Opus 5.5, build Composer 2.5, verify not run
Builder scorecard: left for the coordinator
Files: 27 new under `src/lib/` (14 shared, 13 server), plus `eslint.config.js`, `package.json`, `pnpm-lock.yaml` Pieces: 1 (domain port)
Ported from: `legacy/src/lib/contracts.ts`, `markets.ts`, `seed.ts`, `game-view.ts`, `wager-copy.ts`, `group-activity.ts`, `locale.ts`, `locale-es.ts`, `messages.es.json`, `locale-server.ts`, `utils.ts`, `team-logos.ts`, `team-badge-catalog.json`, `sport-preference.ts`, `storage.ts`, `logger.ts`, `api-request.ts`, `api-response.ts`, `cron-auth.ts`, `email.ts`, `ai-cost.ts`; `legacy/src/data/cache-policy.ts`, `stable-hash.ts`
Deviations from legacy (planned rewrites and splits):

- `src/lib/server/locale.ts`: `getTranslation({ cookieLocale, acceptLanguage })` replaces Next `cookies()`/`headers()` and React `cache`; side-effect import of `locale-es` registers Spanish on the server.
- `src/lib/server/api-response.ts`: `Response.json` and `crypto.randomUUID()` instead of `NextResponse` / `node:crypto`; return type `Response` instead of `NextResponse`.
- `src/lib/server/email.ts`: `PUBLIC_SITE_URL` checked before `NEXT_PUBLIC_SITE_URL`; removed `server-only`.
- `src/lib/shared/sport-preference.ts` + `src/lib/server/domain/sport-preference.ts`: zod schema stays server-side; shared adds `parseSportPreference` with the same `.catch("all")` behaviour.
- `src/lib/server/domain/contracts.ts` imports stake bounds from `../../shared/markets` instead of `@/lib/markets` (same runtime cycle break as legacy).

Deviations from the plan:

- `@types/node` 26.6.6 added so `process`, `Buffer`, and `node:crypto` typecheck in server/domain modules (plan listed only `zod` and `clsx` runtime deps).
- ESLint `@typescript-eslint/consistent-type-imports` enabled (T00 had not added it).

Acceptance:

- `pnpm check` → `CHECK OK 0994892` (`scripts/check-ok.mjs` prints the current HEAD short sha, so a re-run on this commit prints this commit).
- Import-path-only / none rows: body diff against legacy is empty apart from import lines (coordinator grep).
- `grep -rnE 'from "zod"|from '"'"'node:|from ".*lib/server' src/lib/shared` → no matches (comment mentions of `server-only` in `wager-copy.ts` only).
- `grep -rn 'server-only\|next/' src/lib` → no matches.

Budgets touched: `/` first-load JS gzip 30854 bytes (limit 61440). `/games/[id]` n/a. No route changes.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: none

## T02 D1 schema, migrations and sports repositories — 2026-11-03 — PASS

Branch / PR: cf/T02-d1 / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 8 source files (`drizzle.config.ts`, `package.json`, `src/lib/server/db/{schema,client,seed}.ts`, `src/lib/server/data/{sports-repository,sports-data}.ts`, this log). Lockfile, `drizzle/0000_fat_thunderbolts.sql`, `drizzle/0001_starting_grant_trigger.sql`, and `drizzle/meta/` are outside the size cap. Pieces: 8
Ported from: `legacy/src/db/schema.ts`, `legacy/src/db/client.ts`, `legacy/src/db/seed.ts`, `legacy/src/data/sports-repository.ts`, read side of `legacy/src/data/sports-data.ts`
Deviations from legacy:

- Auth tables are Better Auth 1.7 core (`user`, `session`, `account`, `verification`) with the Drizzle sqlite CLI column names (`email_verified` boolean, `token`, `account_id`, `provider_id`, `expires_at`, `value`). Legacy `users`, `sessions`, `accounts`, `verification_tokens` are not created. Every former FK to `users.id` points at `user.id` with the same `onDelete`. `user.email` is NOT NULL, matching Better Auth. There is no unique index on `(provider_id, account_id)`; Better Auth 1.7's core schema does not define one.
- Grant reason is `signup`. `legacy/src/lib/auth.ts` inserts that string inside `createUser`. `legacy/src/data/credits.ts` does not write the grant. Spec §3.6's sample SQL said `starting grant`.
- `wagers.price` is column `price_hundredths` and `wagers.line` is `line_tenths`, through `customType`s that expose 1.85 / 2.5. Other legacy columns keep their names. `games.status` is `json_extract(summary, '$.status')` VIRTUAL, indexed with `scheduled_at` as `games_status_scheduled_at_idx`. drizzle-kit emitted both in `0000`.
- SQLite names a composite PRIMARY KEY index `sqlite_autoindex_*`. The legacy constraint names `team_games_team_id_game_id_pk`, `group_members_group_id_user_id_pk`, and `comment_votes_comment_id_user_id_kind_pk` are also UNIQUE indexes so `sqlite_master` lists them. The PRIMARY KEY constraints are still there.
- `defaultNow()` columns use `.$defaultFn(() => new Date())` and have no SQL default. Better Auth timestamp columns use the CLI default `cast(unixepoch('subsecond') * 1000 as integer)`. `session.updated_at` and `account.updated_at` match the CLI: `$onUpdate`, no SQL default.
- `persistSportsTeamData` is one `runBatch` of upserts and inserts. The legacy transaction selected the team id, then used returned game ids. Those ids are subselects on `teams.slug` and `games.canonical_id` inside the same batch. Snapshot conflict updates copy `excluded.*`. `metadataRefreshed` still chooses the team update set in JS; it is an input flag, not a row read. Route checks throw before the batch. A missing parent inserts zero child rows instead of throwing "Unable to resolve persisted team/game".
- `applyGameUpdates` still reads the stored summary, merges the provider fields, and re-parses with `gameSummarySchema` before each update. The other summary fields are not in the update payload, so a blind `json_set` would drop them. It is not a money predicate.
- `acquireRefreshLease` fails expired `running` rows and inserts the new lease in one batch. The id is `crypto.randomUUID()` before the insert. `onConflictDoNothing()` has no target, so it matches the partial unique index. The lease is held only when that insert's `meta.changes === 1`.
- Read side only of `sports-data`. `scheduleRefresh(sport)` is a no-op (T03 wires the jobs binding). `forceRefresh` calls it and re-reads; it does not call a provider. Not ported: `unstable_cache`, `after()`, `revalidateTag`, `refreshSportData`, `refreshSoccerData`, `refreshBaseballData`, `getCachedDashboardData`, and the fixture-context merge (`readFixtureContext` / `withContextFacts`). `getGameDetail` returns the demo snapshot for a seed route id, otherwise the stored snapshot. `MATCHDAY_DATA_MODE=demo` and a missing `DB` binding both serve the seed. `MATCHDAY_DATA_MODE` is read from `cloudflare:workers` `env`.
- `DatabaseConfigurationError` says "DB binding is not configured". `isDatabaseConfigured()` is true when `env.DB` exists. `checkDatabaseConnection` lists schema tables from `sqlite_master` and pending migrations as journal tags (`drizzle/<tag>.sql`) minus `d1_migrations.name`. Dropped `withDatabaseTransaction` and `setDatabaseForTests`. No D1 Sessions API helper: the plan's client decision list does not include one.
- `seedConfiguredTeams` is still `onConflictDoNothing` on slug (legacy idempotent insert). No `db:seed:local` script; the plan's scripts are `db:generate` and `db:migrate:local`.
- `CanonicalTeamBundle` and `ProviderGameUpdate` live next to the repository. The shapes match `legacy/src/providers/contracts.ts`. The provider package is T03.
- `getLastAiGenerationAt` treats `max(created_at)` as epoch milliseconds.

Packages: `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11.

Acceptance (`scripts/check-ok.mjs` prints the current HEAD short sha, so a re-run on this commit prints this commit):

1. `pnpm check` → `CHECK OK 8bfd5d3`. `/` first-load JS gzip 30854 bytes. `/games/[id]` n/a.
2. `rm -rf .wrangler/state && pnpm db:migrate:local` → both migrations applied, no error. `0000_fat_thunderbolts.sql` ✅, `0001_starting_grant_trigger.sql` ✅. Wrangler executed 67 commands then 2.
3. `pnpm wrangler d1 execute DB --local --env preview --command "SELECT name, sql FROM sqlite_master WHERE type IN ('index','trigger') ORDER BY name"` lists every legacy index name. Partial predicates, verbatim from the `sql` column:
   - `buddy_messages_ip_day_idx` WHERE `"buddy_messages"."role" = 'user'`
   - `buddy_messages_session_day_idx` WHERE `"buddy_messages"."role" = 'user'`
   - `credit_entries_user_grant_uidx` WHERE `"credit_entries"."kind" = 'grant'`
   - `credit_entries_wager_activity_idx` WHERE `"credit_entries"."kind" in ('stake', 'return')`
   - `credit_entries_wager_return_uidx` WHERE `"credit_entries"."kind" = 'return'`
   - `ingestion_runs_active_lease_uidx` WHERE `"ingestion_runs"."status" = 'running'`
   - Trigger `user_starting_grant` is present. `sqlite_autoindex_*` rows have `sql` null (automatic primary keys, including `d1_migrations`).
4. Insert one `user` (`11111111-1111-4111-8111-111111111111`). `SELECT kind, amount, reason FROM credit_entries WHERE user_id = '11111111-1111-4111-8111-111111111111'` → one row `grant | 1000 | signup`. A second `INSERT` of `kind = 'grant'` for that user fails: `UNIQUE constraint failed: credit_entries.user_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)`. SQLite names the columns, not the index. The only UNIQUE index on `credit_entries.user_id` is `credit_entries_user_grant_uidx`.
5. Insert a wager and one `return`. The second `return` for that wager fails: `UNIQUE constraint failed: credit_entries.wager_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)` (`credit_entries_wager_return_uidx`). `INSERT ... ON CONFLICT (wager_id) WHERE kind = 'return' DO NOTHING` then `SELECT changes(), COUNT(*)` → `changes: 0`, `return_rows: 1`.
6. Two `running` `ingestion_runs` rows with the same provider/operation/scope: the second fails `UNIQUE constraint failed: ingestion_runs.provider, ingestion_runs.operation, ingestion_runs.scope: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)` (`ingestion_runs_active_lease_uidx`).
7. `PRAGMA foreign_key_list(wagers)` → `from: user_id`, `table: user`, `to: id`, `on_delete: CASCADE`. `group_id` → `groups(id)` is the other FK.

Budgets touched: `/` first-load JS gzip 30854 bytes (limit 61440). `/games/[id]` n/a. No route changes.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: T03 implements `scheduleRefresh`, the fixture-context merge on `getGameDetail`, and the provider refresh that calls `persistSportsTeamData`. The spec's Sessions API bookmark helper was not in this plan's client.ts list.

## T03 Providers and the jobs Worker — 2026-11-04 — PASS (round 2)

Branch / PR: cf/T03-jobs / (not opened) Models: plan Claude Opus 5.5, build Composer 2.5, verify not run
Builder scorecard: left for the coordinator
Files: ~50 under `src/lib/server/providers/`, `src/lib/server/data/{publish,fixture-context,fixture-facts,sports-data}.ts`, `workers/jobs/`, cron routes, wrangler and package updates, plus `scripts/port-legacy-imports.mjs`. Lockfile and `.dev.vars` (gitignored) outside the cap. Pieces: 9
Ported from: `legacy/src/providers/**`, refresh side of `legacy/src/data/sports-data.ts`, `legacy/src/data/{fixture-context,fixture-facts,fixture-context-repository}.ts`, cron routes under `legacy/src/app/api/cron/`
Deviations from legacy (planned rewrites):

- `invalidatePublicSports` / Next `after()` / `revalidateTag` → `publishReadModels()` after each successful team persist (and after fixture-context upsert).
- KV keys: `board:v1`, `game:v1:<routeId>` (team-perspective route id, not canonical id), `routes:v1`, `publish:version`.
- `scheduleRefresh` → `waitUntil(env.JOBS.refresh(sport))` when the binding exists.
- App `/api/cron/*` forwards to the `JOBS` RPC (`refreshAll`, `settle`, `enrich`); `settle()` stub returns `{ skipped: "settlement arrives in T09" }`.
- `src/lib/server/auth-config.ts` uses `BETTER_AUTH_SECRET` (T07 wires Better Auth).
- `tsconfig.json` `#lib/*` path for SvelteKit 3 routes; `cloudflare-workers.d.ts` declares `waitUntil`.

Deviations from legacy (Workers runtime):

- `defaultFetch()` binds `globalThis.fetch` (unbound fetch throws in Workers).
- Timed provider/MCP fetches use `fetchWithTimeout()` (`clearTimeout` in `finally`) instead of `AbortSignal.timeout` / the old `abortSignalTimeout()` helper (uncleared timers kept RPC isolates alive after refresh).
- `providerEnv()` reads secrets from `cloudflare:workers` `env` with `process.env` fallback.
- `publishReadModels()` builds a partial `board:v1` when only some teams have stored schedules (baseball-only preview before soccer tokens).
- `dueWork()` uses `or(isNull(builtAt), lt(builtAt, …))` instead of a raw `sql` template on a left-joined column — the template made D1 reject the enrich query.
- `enrichDueFixtures()` returns `{ ok: false, reason: "failed" }` instead of throwing after a run error so the jobs RPC does not trip workerd’s false “hung Worker” report on rejected RPC.

Deviations from the plan:

- SvelteKit 3 rejects POST with no `Content-Type` from clients without an `Origin` header (`Cross-site POST form submissions are forbidden`). Bearer-authorized POSTs with `Content-Type: application/json` work; CSRF settings unchanged.
- Round-1 acceptance used GET cron with Bearer; round-2 enrich uses POST + JSON as production schedulers should.

Packages: `csv-parse` 7.0.3.

Preview: `matchday-jobs-preview` and `matchday-preview` redeployed after round-2 fixes; `CRON_SECRET` and enrichment MCP secrets on jobs preview; **`FOOTBALL_DATA_API_TOKEN` is not set on preview** (coordinator removed the placeholder) — soccer refresh reports `skipped` / `unconfigured`, expected.

Round 1 coordinator blockers fixed:

1. Enrich RPC hang → root cause was `dueWork` query failure plus throw across RPC; fixed as above. `POST /api/cron/enrich` with Bearer + JSON → 200 and legacy summary `{ ok, runId, built, skipped, failed, … }`; jobs tail `Jobs.enrich - Ok` and `fixture_context` `info` with zero counts (no due fixtures inside horizon on preview).
2. App `/api/cron/*` catches RPC failures, logs `api_request` at `error` with `requestId`, returns `{ error: { code: "internal_error", … } }` (not a raw 500 body).

Acceptance (secrets redacted; `pnpm wrangler kv key get` needs the key before `--remote`):

1. `pnpm check` → `CHECK OK` on branch tip (`5a85956` at round-2 close). Jobs dry-run upload ~1307 KiB, exit 0.
2. `curl -s -H "Authorization: Bearer $CRON_SECRET" https://matchday-preview.jolyyjhon.workers.dev/api/cron/refresh` → 200, baseball `succeeded`, soccer `skipped` (`unconfigured` without `FOOTBALL_DATA_API_TOKEN`).
3. `curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" https://matchday-preview.jolyyjhon.workers.dev/api/cron/enrich` → 200, `data.ok: true`, `built/skipped/failed: 0`; `wrangler tail matchday-jobs-preview` → `Jobs.enrich - Ok`, no hung cancellation.
4. KV `board:v1` still populated for baseball teams after refresh; health `database.status` `healthy`.

Budgets touched: `/` first-load JS gzip 30854 bytes (limit 61440). `/games/[id]` n/a.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Set real `FOOTBALL_DATA_API_TOKEN` on preview when coordinator supplies it; T04 owns hooks and shell (not created here).
