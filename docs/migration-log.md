# Cloudflare migration log

Spec: [cloudflare-migration-spec.md](cloudflare-migration-spec.md).

## How this run is executed

- Builders run headless through the Cursor CLI (`cursor-agent -p`), one git worktree per ticket under `/home/oscar/Projects/plan-bet-wt/`. Grok 4.7 (`grok-4.7-high`) builds even tickets; Composer 2.5 (`composer-2.5`) builds odd tickets. GLM and DeepSeek were the first choice but are not included in the Cursor plan; Oscar chose the included models.
- The coordinator (Claude Opus 5.5, Claude Code session) writes each ticket plan to `.cursor/plans/Txx.md`, reviews the result, sends findings back to the same builder chat, and merges into `cf/main` after review passes. Oscar asked for the run to continue without per-ticket approval; production (T15) still waits for Oscar.
- Bugbot and Agent Review are not used in this headless run; the coordinator's review plus a fresh-context reviewer on Tier A tickets replace them.

## Builder scorecard

| Ticket | Tier | Builder      | Plan followed | Gate loops | Review rounds | Blocker / major / minor | Invariant breaks | SvelteKit 2 slips | Invented APIs | Sandbox | Outcome                                                                   | Wall time                                                                      | Cost     |
| ------ | ---- | ------------ | ------------- | ---------- | ------------- | ----------------------- | ---------------- | ----------------- | ------------- | ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| T00    | B    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 0               | 0                | 0                 | 0             | clean   | PASS                                                                      | 21.5 min                                                                       | included |
| T01    | B    | Composer 2.5 | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS                                                                      | 2.8 min                                                                        | included |
| T02    | A    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 2               | 0                | 0                 | 0             | clean   | PASS                                                                      | 19.8 min                                                                       | included |
| T03    | B    | Composer 2.5 | yes           | 0          | 2             | 1 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS (round 2)                                                            | 25.4 min                                                                       | included |
| T04    | A    | Grok 4.7     | yes           | 0          | 2             | 0 / 1 / 0               | 0                | 0                 | 0             | clean   | PASS (round 2)                                                            | 43 min (process hung after committing both rounds; killed at limit)            | included |
| T05    | C    | Composer 2.5 | yes           | 0          | 2             | 0 / 1 / 1               | 1 (layering)     | 0                 | 0             | clean   | PASS (round 2)                                                            | 11.2 min                                                                       | included |
| T07    | A    | Composer 2.5 | yes           | 0          | 1             | 0 / 0 / 3               | 0                | 0                 | 0             | clean   | PASS                                                                      | 10.7 min                                                                       | included |
| T06    | C    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS                                                                      | 26.5 min (exited cleanly)                                                      | included |
| T08a   | A    | Grok 4.7     | yes           | 0          | 2             | 0 / 3 / 4               | 0                | 0                 | 0             | clean   | PASS (round 2)                                                            | 42 min                                                                         | included |
| T09    | A    | Composer 2.5 | yes           | 0          | 1             | 0 / 0 / 2               | 0                | 0                 | 0             | clean   | PASS                                                                      | 5.7 min                                                                        | included |
| T08b   | A    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 2               | 0                | 0                 | 0             | clean   | PASS                                                                      | 65.5 min (overran the 60-min cap mid-acceptance; finished in the same session) | included |
| T14    | A    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS                                                                      | 32.7 min (exited cleanly)                                                      | included |
| T10    | A    | Grok 4.7     | yes           | 0          | 2             | 0 / 1 / 0               | 0                | 0                 | 0             | clean   | PASS (round 2; round 2 caused by a coordinator plan error)                | 41.8 min                                                                       | included |
| T11    | B    | Composer 2.5 | yes           | 0          | 2             | 0 / 1 / 1               | 0                | 0                 | 0             | clean   | PASS (round 2)                                                            | 16.9 min                                                                       | included |
| T12    | B    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS                                                                      | 29.3 min (exited cleanly)                                                      | included |
| T14b   | A    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 0               | 0                | 0                 | 0             | clean   | PASS                                                                      | 6.2 min                                                                        | included |
| T13    | C    | Composer 2.5 | partly        | 0          | 3             | 0 / 2 / 0               | 0                | 0                 | 0             | clean   | PASS (round 3, residual recorded)                                         | 13 + 9 + 50 min                                                                | included |
| T16    | B    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 0               | 0                | 0                 | 0             | clean   | PASS                                                                      | 17 min                                                                         | included |
| T13b   | C    | Grok 4.7     | yes           | 0          | 3             | 0 / 0 / 0               | 0                | 0                 | 0             | clean   | PASS (round 3; FCP target missed rounds 2–3, residual handed to T13c)     | 3 rounds                                                                       | included |
| T13c   | C    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS (target 0.88 s missed; coordinator gated `start` on the paint entry) | 28 min to commit; process hung after, killed                                   | included |
| T13d   | C    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS (coordinator added the `readyState` fallback for the font gate)      | 47.7 min                                                                       | included |

### Builder comparison after T14 (Opus, 2026-11-04)

Counts are from the scorecard rows above. A round counts as builder-caused unless the row says otherwise.

|                                  | Grok 4.7 (10 tickets)                                                 | Composer 2.5 (7 tickets)                            |
| -------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| Tier mix                         | 7 A (T02, T04, T08a, T08b, T10, T14, T14b), 2 B (T00, T12), 1 C (T06) | 2 A (T07, T09), 3 B (T01, T03, T11), 2 C (T05, T13) |
| First-round passes               | 7 of 10 (8 counting T10, whose round 2 was a plan error)              | 3 of 7 (T01, T07, T09)                              |
| Blockers / majors / minors       | 0 / 4 builder-caused (+1 plan-caused) / 11                            | 1 / 4 / 9                                           |
| Invariant breaks                 | 0                                                                     | 1 (T05 layering)                                    |
| SvelteKit 2 slips, invented APIs | 0, 0                                                                  | 0, 0                                                |
| Sandbox violations               | 0                                                                     | 0                                                   |
| Wall time, total / mean          | ~328 min / ~33 min                                                    | ~145 min / ~21 min                                  |

What each did well, with rows:

- **Grok** carried the riskiest tickets: schema (T02), money placement (T08a), groups (T10) and the data migration (T14, T14b). It produced the strongest evidence unprompted, such as 0 px parity measurements (T04, T06), the counting stub for the buddy (T12), and proof that removing a guard fails the scenario (T08a round 2). Its money logic passed an independent audit on the first try (T08a).
- **Composer** was 1.6× faster per ticket and very accurate on verbatim ports (T01: zero non-import diffs). It found a real root cause quickly when sent back (T03 D1 query), and its round-2 fixes were fast (T05 2.5 min, T10-style fixes under 10 min).

Repeated weaknesses, with rows:

- **Grok**: the CLI process stayed alive long after committing (T04 twice), and one run overran the cap (T08b). Mitigated by caps and "commit early" in prompts; later runs (T06, T12, T14) exited cleanly.
- **Composer**: skipped or handed acceptance items to the coordinator (T09 preview settle, T11 browser rollback, T13 five items), and once composed data sources in a route (T05). It needed an explicit "these are yours, here is how" second round each time.

Suggested split for similar work: Grok for money, auth, data and other Tier A tickets; Composer for verbatim ports and UI tickets, with acceptance written as commands it must paste output for.

## Coordinator notes

- T00 review (Opus): gate re-run `CHECK OK 5015ec1`; legacy demo build passes; preview health healthy (D1 `select 1` 172 ms from the São Paulo edge to the ENAM primary). Grok's note is correct: adapter-cloudflare 8 passes no `platform` to `server.respond`, so bindings come from `import { env } from "cloudflare:workers"` (and `waitUntil` from the same module). Later plans use that instead of `platform.env`/`platform.ctx`.

- T01 review (Opus): gate `CHECK OK 05a8e61`; every verbatim port diffs clean against legacy except the planned `PUBLIC_SITE_URL` line in `email.ts`; both JSON files byte-identical; no runtime zod/node/server import in `src/lib/shared`. Minor: `api-response.ts` dropped the `ApiSuccess`/`ApiFailure` body types when moving to `Response` (no behaviour change).

- T02 review (Opus): gate `CHECK OK d11226d`; fresh local migrate applies 0000 + 0001; schema dump matches legacy tables, onDelete rules and enum CHECKs; independently confirmed with SQL: one `grant 1000 signup` per user via trigger, second grant rejected, second `return` rejected and `ON CONFLICT (wager_id) WHERE kind='return'` is a no-op, duplicate `running` lease rejected, duplicate idempotency key rejected. Good catch by Grok: legacy grant reason is `signup`. Minor: Better Auth's `user.name`/`user.email` are NOT NULL while legacy allowed null; T14's transform must default them. Minor: fixture-context merge in `getGameDetail` deferred; added to T03's plan.

- T03 review (Opus): round 1 BLOCK — the enrich RPC failed and surfaced as a hung Worker (500 from the cron route). Composer's round 2 found the cause: a Drizzle `sql` fragment in `dueWork` that D1 rejected (fixed with `or(isNull, lt)`, same semantics as legacy) plus a throw across the RPC boundary; it also cleared abort timers and made the cron routes return the legacy error envelope. Re-verified: enrich 200 twice, refresh 200 (baseball succeeded, soccer skipped: no football token on the preview), `board:v1` published. Minor: bearer cron POSTs need `Content-Type: application/json` under SvelteKit 3 CSRF; Workers cron uses RPC so nothing depends on it.

- T04 review (Opus): round 1 one MAJOR — SvelteKit sets `private, no-store` on every data response and the cache treated that as an opt-out, so client-navigation data was never cached. Round 2 fixed it (data requests opt out only via `x-mp-opt-out: 1`); re-verified locally: data MISS→HIT, session cookie BYPASS, HTML rules unchanged. Grok's parity measurements (0 px vs production, 320/390/1280 × en/es) and cache checks reproduced. Observation: both Grok runs kept the CLI process alive long after committing (41 min of work then idle until the 2 h limit; round 2 committed after 2 min then idle until killed); later runs use a shorter timeout and are judged by the commit. Merge into cf/main needed conflict resolution in package.json and this log (T04 branched before T02/T03). The shell alone puts `/` at 54.5 KB of 60 KB.

- Vercel (Opus): pushing cf/main made Vercel build it as Next.js and fail (Oscar saw the failed preview builds). Root `vercel.json` on cf/main now has an `ignoreCommand` that exits 0, so Vercel skips those builds (status: "Canceled by Ignored Build Step"); main is unaffected. T15: when cf/main merges into main this file also stops production Vercel builds, which is intended; the 308-redirect deploy in the cutover runbook must be done from a separate branch or by removing this file in that commit.

- T05 review (Opus): round 1 one MAJOR — the home page loader merged KV and D1 itself with a hard-coded team list (layering rule); round 2 moved it into `getCachedDashboardData()`, which now returns every configured team (KV, then D1, then seed). Minor: sport-chip no-network unverified in round 1; round 2 measured 0 requests. Baseball row geometry 0 px vs production at 320/390/1280 × en/es. `/` JS 65,072 B gzip vs 61,440 target (BUDGET WARN, decision for Oscar). Coordinator fixes made during this review: guard narrowed to the Vercel CLI (it blocked requests to plan-bet.vercel.app); budget gate warns up to 25% over and fails beyond, per spec §1.

- T07 review (Opus): gate `CHECK OK 2223aa1`. Verified in Better Auth 1.7.5 source that `user.validateUserInfo` exists and that the OAuth callback passes the raw Google profile, so the `email_verified` refusal works (not an invented API). Signed-in requests bypass the edge cache; the chip reads balance, W–L and open count in one `db.batch()`. Minor: the Google check runs on account creation/linking, not on every sign-in as legacy did; during maintenance an in-flight OAuth callback (GET) can still complete; `getSession` runs on every request (cheap with the cookie cache). `requireAccount(event)` now takes the request event.

- T06 review (Opus): gate `CHECK OK c1a5f27`; unknown id 404 with no provider call; upcoming baseball game pages 0 px vs production at 320/390/1280 × en/es; preview paints 8–30 ms after the board click; page and data request MISS→HIT. Minor (deferred to T08b, which owns the panel): the anonymous sign-in card renders even when auth is unconfigured, where legacy renders nothing. Not verifiable on the preview: finished games (no finished rows in preview D1). `/` JS crept to 67,755 B (BUDGET WARN); `/games/[id]` 61,594 B.

- T08a review (Opus + independent Opus audit): round 1 money logic passed the audit (no ledger-corrupting sequence; every legacy lock check is a predicate in the write batch) but 3 MAJOR + 4 MINOR: the scenario never exercised the batch's game/membership predicates; a failed batch fell back to insufficient_balance with a full balance; a retry could report a rejection for a placed wager; ledger SQL blind to orphan stakes; step 8 vacuous on 0 successes; step 10 order-dependent; no totals-line round-trip. Round 2 fixed all seven, exported `commitPlacement`, and showed the script fails with the games predicate removed. Re-verified on a fresh DB: 18 PASS lines, MONEY SCENARIO OK, LEDGER INVARIANTS OK, `CHECK OK e81a5ab`. Docs follow-up for T15: `docs/wagers.md` still describes Postgres advisory locks.

- T09 review (Opus): gate `CHECK OK 7221142`. Re-ran the settlement scenario on a fresh DB: run 1 settles won 19 / lost 0 / void 10 (stake back), run 2 pays nothing, the live game's wager stays open, LEDGER INVARIANTS OK. Preview: authorized `POST /api/cron/settle` 200, `/system` 200 in en and es, health `schema: current`, `pendingMigrations: 0`, `publish.version` present; overall `degraded` only because football-data has no token on the preview. Minor: the scenario's documented command (`node --experimental-strip-types`) fails on TypeScript parameter properties; it runs with `pnpm dlx tsx` — needs a `verify:settle` package script (assigned to T11). Minor: the builder wrote its own scorecard row; removed (the coordinator owns the scorecard).

- T08b review (Opus): gate `CHECK OK e0e3c08`. Server changes are read-only (`listGroupsForUser`, `slip-wager.ts` reads). The slip derives potential return for display only and sends stake + price (compared server-side) with a stable idempotency key; the anonymous sign-in card now renders only when auth is configured (T06 carry-over). Builder evidence: place 10 → chip 990 and /you lists it; second Place replays (201 then 200); over-balance stake disables Place without rewriting; reset back to 1,000; money scenario + ledger OK; signed-out game page MISS→HIT with no user data in the HTML. Minor: the fixed tour bar overlaps the lower slip column (Place stays clear). Minor: `/` 69,046 B and `/games/[id]` 69,285 B gzip — `/` keeps creeping (BUDGET WARN).

- T14 review (Opus): read the transform and reconcile: Auth.js users/accounts map onto Better Auth with ids preserved (emailVerified from `email_verified IS NOT NULL`, accountId from `provider_account_id`), prices/lines to hundredths/tenths, the grant trigger is dropped before users and recreated byte-identical; reconcile recomputes per-user balance/wagers/open/stake/return from the export and compares with D1, so it can't pass vacuously, then runs the ledger invariants; production reconcile is refused without `MP_RECONCILE_PROD=1`. Builder rehearsal on Docker Postgres → local D1: `RECONCILE OK users=6 tables=20`, grants = users after import, a new user afterwards gets exactly one grant, edge cases (quotes, emoji, newline, totals line, void, zero reset) round-trip; a no-email user who owns a wager makes the transform refuse. Minor: apostrophes are emitted as `char(39)` to dodge Wrangler's SQL splitter (works; verified by round-trip). Re-run reconcile after T10 if it adds tables.

- T10 review (Opus): round 1 one MAJOR — non-member group APIs returned 404 instead of legacy's 403 `forbidden`; the T10 plan wrongly said 404 'as legacy does', and Grok followed the plan (coordinator error). Round 2 restored 403 with legacy messages (missing group stays 404; the page stays 404). Verified: `CHECK OK d3aee47`, GROUPS SCENARIO OK (one pending link per group via migration 0002's partial unique index, accept-vs-revoke never both win, accept-page GET doesn't join, removed members can't place group wagers), MONEY SCENARIO OK + LEDGER INVARIANTS OK. Accepted deviations: slug allocation retries on the unique index; group activity consolidated into one component; `loading.tsx` not ported (navigation preview covers it). `/` 70,183 B gzip (BUDGET WARN).

- T11 review (Opus): round 1 server side accepted (COMMENTS SCENARIO OK: one comment per phase, non-member can't read/post/vote, removed member loses access because membership is re-checked inside the write); reading membership on the thread read is a stricter-than-legacy choice, accepted. Round 1 MAJOR: the browser rollback check was skipped; MINOR: log edit left uncommitted. Round 2: real preview snapshot copied into local D1, forced-500 vote 0→1→0, real vote 0→1 (`VOTE BROWSER ACCEPTANCE OK`), `CHECK OK 341535b`. Also fixed T09's carry-over (`pnpm verify:settle` with tsx). Observation: Composer's local wrangler needed `--compatibility-date 2026-10-26`; check in T13 whether the installed workerd supports 2026-11-01.

- T12 review (Opus): read the quota claim — one `INSERT … SELECT … WHERE` (session < 30 and IP hash < 100 user turns since the UTC day start), claimed only on `meta.changes === 1`, and the OpenAI call runs only after a claim; a missing key, hash secret or client IP returns the deterministic reply with no claim (fails closed). Builder evidence with a counting stub: 31st session turn and 101st IP turn refused with the stub at 30 and 100 hits; unknown `[fact-id]` retracts (`ok: false`, stored rejected); valid stream `ok: true` with no brackets; dialog chunk loads only on open; budgets +815 B. Minor: `buddy.ts` carries its own comment-thread query because T11 wasn't on its branch — T13 switches it to `game-comments.ts`. Coordinator set `OPENAI_API_KEY`, `OPENAI_MODEL` and `RATE_LIMIT_HASH_SECRET` on the preview from `.env.local`.

- G2 real-data rehearsal (Opus, 2026-11-04): read-only export of production Neon (one REPEATABLE READ READ ONLY transaction): 20 tables, 2,349 rows (4 users, 45 wagers, 95 ledger entries, 2 groups, 5 memberships, 24 buddy messages). First transform failed on one 138 KB `provider_cache` row (D1's 100 KB statement limit); fixed in T14b (oversized cache rows skipped and recorded; any other oversized row still fails). Re-run into a fresh local D1: 32 statements, import + migrate in ~4 s, `RECONCILE OK users=4 tables=20` (only documented skips: sessions, verification tokens, that one cache row), ledger invariants clean, 4 users = 4 grants, trigger restored, balances 824/968/1000/1000, 1 open wager. Everyone will need to sign in again (sessions aren't migrated). The real export and local imported state were deleted afterwards; cutover re-exports.

- T13 review (Opus): round 1 cut `/` JS 71,075 → 60,589 B and added the service worker, view transitions, Early Hints, AVIF and OG assets, but deferred five acceptance checks (MAJOR); round 2 ran them (SW offline OK and no HTML cached when signed in; inline CSS worsened LCP and was reverted; parity mostly 0 px, data-caused gaps listed; COMMENTS SCENARIO OK). Coordinator then measured both sites side by side (Lighthouse 12 mobile ×3, same machine): production 93 / FCP 0.95 s / LCP 3.2 s; preview 87 / FCP 2.47 s / LCP 3.59 s despite 2× faster TTFB — stylesheet 35th in head behind 27 modulepreloads, desktop and duplicate stadium images on phones (MAJOR). Round 3 put CSS first, capped `/` modulepreloads at 6, merged tiny chunks, and fixed the image hints: preview now 87–96 / FCP 1.52–2.2 s / LCP 2.57–3.67 s vs production 93 / 0.95 / 3.2; bytes 360 KB vs 505 KB; TTFB 137 vs 307 ms. Residual: first paint still slower on the simulated slow-4G profile (CSS shares bandwidth with three preloaded fonts, hero crests and six High-priority module preloads). Stopped at the round cap; follow-up T13b re-measures on the custom domain (edge cache + 103 Early Hints active) and tunes priorities there.

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

## T04 App shell and edge cache — 2026-11-04 — PASS

Branch / PR: cf/T04-shell / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 55 source and config files (48 new under `src/`, 6 modified, this log) plus 260 static files. The static copy is `legacy/public` plus four woff2 files and `robots.txt`; T00 treated that kind of bulk move as outside the ~40-file cap. Pieces: 7
Ported from: `legacy/src/app/globals.css`, `legacy/src/app/games/[id]/matchup.css`, `legacy/src/app/fonts.ts` (faces and the metrics a demo build emitted), `legacy/src/app/robots.ts`, `legacy/src/app/layout.tsx`, `legacy/src/app/error.tsx`, `legacy/src/app/not-found.tsx`, `legacy/src/lib/store.ts`, `legacy/next.config.ts` redirects, and the shell components named in the plan (`app-shell`, language, clock, tour, refresh, band height, demo stamp, breadcrumb, fast links, navigation preview, route error, and the listed `ui/` primitives). Match chrome, scorebug, status ribbon, and the bet-slip skeleton came along because the navigation preview renders them.
Deviations from legacy:

- Spanish strings are passed from `+layout.server.ts` only when `locals.locale` is `es`, then registered before the first child render. Legacy loaded them with a client `import()`. A dynamic import here either raced hydration or needed Svelte's experimental async mode.
- `refresh-visible-page` also skips 2g/3g (`effectiveType`), which the plan asks for. Legacy's refresh only checked `saveData`.
- The `tz` cookie is kept only when `viewerZone(cookie) === cookie`, so an invalid cookie falls through to `request.cf.timezone` before UTC.
- Button `asChild` is an `href` prop. Submit pending state follows the form's submit event, `afterNavigate`, and the page snapshot.
- The request clock lives in `clock.svelte.ts`. A module named `request-clock.svelte.ts` resolves as the `request-clock.svelte` component.

Deviations from the plan:

- Cache-key segments for version, locale, zone, and sport are `encodeURIComponent`'d so an IANA zone with a slash stays one path segment. The key is still `https://cache.matchday.internal/v{version}/{locale}/{zone}/{sport}{pathname}?{sorted query}`.
- Eligibility and the cache key use the original `request.url`. SvelteKit 3 strips `/__data.json` (and `.html__data.json`) before `handle`, so `event.url` would store the HTML and the data request on the same key.
- A route opts out of storage with `Cache-Control` containing `private` or `no-store`, or with `x-mp-opt-out: 1`. `/api` responses are returned untouched.
- `resolve()` only types routes that exist in this build (`/` and `/api/health`). Shell links pass the pathname through `asRoute()` and then `resolve()`, so the base path is still applied. Runtime receives the real path.
- Generated `node_modules/$app/tsconfig.json` has empty `paths` (kit fills those from the deprecated `alias` option, not `package.json` `imports`). `tsconfig.json` maps `#lib/*` so `svelte-check` can see it.
- Prettier rewrote the fallback `line-gap-override` from `0.0%` to `0%`.
- Node on this machine is 24.20.0; `package.json` engines ask for 24.18.1. pnpm warns and the gate still passes.

Acceptance:

1. `pnpm check` → `CHECK OK 8bfd5d3` and `/ 54488` (limit 61440). `/games/[id]` n/a. `scripts/check-ok.mjs` prints the current HEAD short sha, so a re-run on this commit prints this commit.
2. `pnpm preview:cf` (wrangler dev --env preview), then:
   - `curl -sD- -o /dev/null http://localhost:8787/` → `x-mp-cache: MISS`, `x-mp-version: 0`, `cache-control: public, max-age=0, must-revalidate`.
   - The same command again → `x-mp-cache: HIT` and the same browser `cache-control`.
   - `curl -sD- -o /dev/null -H 'Cookie: better-auth.session_token=x' http://localhost:8787/` → `x-mp-cache: BYPASS`, `cache-control: private, no-cache`.
   - `curl -sD- -o /dev/null -H 'Cookie: locale=es' http://localhost:8787/` after the English hit → `x-mp-cache: MISS`.
   - `curl -sD- -o /dev/null http://localhost:8787/api/health` → `cache-control: no-store` and no `x-mp-cache`.
   - `curl -sD- -o /dev/null 'http://localhost:8787/bets?x=1'` → `308`, `location: /you?x=1`.
3. Code paths in `src/lib/server/edge-cache.ts`, applied from `src/hooks.server.ts`:
   - Session cookie: `hasSessionCookie` sees `better-auth.session_token` or `__Secure-better-auth.session_token`. `isCacheableRequest` returns false, so the hook does not call `cache.match` or `cache.put` and decorates the rendered response `BYPASS` with `private, no-cache` when `signedIn`.
   - `Set-Cookie`: `isStorableResponse` returns false, so the hook does not `cache.put`. The response is `BYPASS`.
   - Any other path: `isAllowlisted` is false, `isCacheableRequest` returns false, and the hook returns `BYPASS` without storing. `/api` and `/api/*` are returned before that decoration, which is why health keeps `no-store` and has no `x-mp-cache`.
4. `pnpm deploy:preview` → https://matchday-preview.jolyyjhon.workers.dev version `c0bdf982-380a-41f7-80d2-fa42b4cc4df8`. Headless Chrome (`/usr/bin/google-chrome`, CDP `getBoundingClientRect`) compared that `/` with https://plan-bet.vercel.app at 320, 390, and 1280 in English and Spanish (`locale=es`). Header, bottom nav, and footer box matched within 0 px. Shared numbers: topbar `y=0 h=73`; mobile nav at 320 and 390 `y=724 h=76` (padding `5.6px 5.6px 0px 5.6px`); nav at 1280 `display:none` and `0×0`. Footer heights: 320 en 197.48, 320 es 241.48, 390 en 179.25, 390 es 197.48, 1280 en/es 161.02. Footer padding `16px 16px 81.7812px 16px` on phones and `16px 32px 81.7812px 32px` at 1280. Footer document `y` differs because the board is not in this ticket; the footer box does not. One natural pass at 1280 English showed production width 1265 and preview 1280: the live board makes the document scroll and the placeholder does not. Forcing `overflow-y: scroll` on both made both widths 1265. The tour bar was present on both sites in every cell.
5. No `console.error` and no runtime exception on `/` in either language, on production or the preview.

Budgets touched: `/` first-load JS gzip 54488 bytes (limit 61440). `/games/[id]` n/a.
Review: gate CHECK OK 8bfd5d3 before commit; verifier, auditor, agent review, and bugbot not run (coordinator).
FOLLOWUPS: none

Round 2 (coordinator review, one MAJOR): SvelteKit's data endpoint always sends `cache-control: private, no-store`. `isStorableResponse` treated that as an opt-out, so every `/__data.json` request was `BYPASS` and never stored. Data requests now ignore that default. A data request opts out only with `x-mp-opt-out: 1`. HTML still opts out on `private` or `no-store`. Session cookie, `Set-Cookie`, non-200, and non-allowlisted paths are unchanged.

Round 2 gate: `pnpm check` → `CHECK OK 5592dfa` and `/ 54488` (limit 61440). That sha is HEAD before this commit.

Round 2 acceptance, fresh `pnpm preview:cf` after the rebuild:

- `curl -sD- -o /dev/null 'http://localhost:8787/__data.json?x-sveltekit-invalidated=01'` → `x-mp-cache: MISS`, `cache-control: public, max-age=0, must-revalidate`.
- The same command again → `x-mp-cache: HIT` (and `cf-cache-status: HIT`).
- The same URL with `-H 'Cookie: better-auth.session_token=x'` → `x-mp-cache: BYPASS`, `cache-control: private, no-cache`, no `cf-cache-status` (not served from the stored data response).
- HTML `/` → `MISS` then `HIT`, both `public, max-age=0, must-revalidate`, with `x-mp-version: 0`. Session cookie on `/` → `BYPASS`, `private, no-cache`. `Cookie: locale=es` → `MISS`. `/api/health` → `cache-control: no-store` and no `x-mp-cache`. `/bets?x=1` → `308`, `location: /you?x=1`.

## T07 Auth — 2026-11-04 — PASS (builder)

Branch / PR: cf/T07-auth / (not opened) Models: plan Claude Opus 5.5, build Composer 2.5, verify not run
Builder scorecard: left for the coordinator
Files: 10 modified, 9 new under `src/` (`auth.ts`, `maintenance.ts`, `data/credits.ts`, `data/wagers-repository.ts`, `account-control.svelte`, `sign-in/*`, `sign-out/+server.ts`), plus `package.json`, lockfile, Spanish maintenance string, this log. Pieces: 8
Ported from: `legacy/src/lib/auth.ts`, `legacy/src/lib/auth-config.ts`, `legacy/src/app/sign-in/page.tsx`, `legacy/src/components/account-control.tsx`, balance/open-count reads from `legacy/src/data/credits.ts` and `legacy/src/data/wagers-repository.ts`
Deviations from legacy (planned rewrites):

- Better Auth 1.7.5 + Drizzle sqlite adapter replaces Auth.js; starting grant stays the T02 trigger only (no app-code grant).
- `BETTER_AUTH_SECRET` replaces `AUTH_SECRET`; `isAuthConfigured()` requires secret + D1 + at least one OAuth provider (spec §3.8).
- Google `email_verified !== true` is refused via Better Auth `user.validateUserInfo` (docs: /docs/concepts/users-accounts — provisioning gate); OAuth error redirects with `?error=AccessDenied` like legacy.
- Sign-in uses `better-auth/svelte` client on `/sign-in` only; sign-out is `POST /sign-out` calling `auth.api.signOut`.
- `preview:cf` pins `--port 8787`; local auth needs `.dev.vars` `PUBLIC_SITE_URL=http://localhost:8787` so `baseURL` matches `svelteKitHandler` origin checks.

Deviations from the plan:

- `/` first-load JS gzip 55796 bytes vs T04 54488 (+1308 B, ~284 B over the ±1 KiB coordinator note); account chip + maintenance banner in the root layout account for the delta. Sign-in client code stays on `/sign-in` chunk.
- Maintenance banner reads `String(MATCHDAY_MAINTENANCE) === "1"` so wrangler `--var MATCHDAY_MAINTENANCE:1` works.

Packages: `better-auth` 1.7.5.

Preview: set random `BETTER_AUTH_SECRET` on `matchday-preview` with `wrangler secret put --env preview` (2026-11-04). OAuth client secrets not set (coordinator).

Acceptance (`scripts/check-ok.mjs` prints HEAD short sha after commit):

1. `pnpm check` → `CHECK OK` and `/` 55796 (limit 61440); `scripts/check-ok.mjs` prints the current HEAD short sha on re-run. `/games/[id]` n/a.
2. Local `pnpm preview:cf` (D1 migrated, `.dev.vars` with `PUBLIC_SITE_URL=http://localhost:8787`):
   - Without secrets: `/` renders with empty `topbar-controls`; `/sign-in` → `Sign-in unavailable` + provider copy.
   - With `BETTER_AUTH_SECRET` + GitHub vars: `/sign-in` → `Choose a provider` + `Continue with GitHub` only.
3. `pnpm exec wrangler dev --env preview --port 8787 --var MATCHDAY_MAINTENANCE:1` then `curl -s -X POST -H 'Content-Type: application/json' http://localhost:8787/api/auth/sign-in/social -d '{"provider":"github"}'` → `{"error":{"code":"maintenance",...}}` HTTP 503; GET `/` still 200 (banner when `maintenance` local is true after rebuild).
4. Simulated session (local D1):
   - Insert `user` `22222222-2222-4222-8222-222222222222` → one `grant` 1000 `signup`; insert `session` row with `token` `local-t07-session-token`.
   - Cookie: name `better-auth.session_token` (HTTP) or `__Secure-better-auth.session_token` (HTTPS). Value is **signed**, not the raw DB token: `encodeURIComponent(\`${token}.${base64HmacSha256(token, BETTER_AUTH_SECRET)}\`)`(better-call`signCookieValue`, same as Better Auth session cookie).
   - Example signed value for this rehearsal: `local-t07-session-token.cTRs67J8pci%2FQA2bkeAhel2abj1lv%2FojbvS0D7%2F8T1E%3D` with the local secret above.
   - `curl -sD- -o /dev/null -H 'Cookie: better-auth.session_token=<signed>' http://localhost:8787/` → `x-mp-cache: BYPASS`, `cache-control: private, no-cache`; HTML chip `1,000` and `0-0`.
   - `INSERT` stake `-10` for that user → chip reads `990`.
5. Google `email_verified: false`: `src/lib/server/auth.ts` `user.validateUserInfo` returns `{ error: "AccessDenied" }` when `source.oauth.providerId === "google"` and `isTrustedProviderEmail` fails on `source.oauth.profile.email_verified`. Better Auth docs: validateUserInfo runs before OAuth provisioning and returns 403 / redirect error when `result.error` is set. Live OAuth refusal when preview Google is configured is for the coordinator.

Budgets touched: `/` first-load JS gzip 55796 bytes (limit 61440). `/games/[id]` n/a.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Coordinator sets OAuth secrets on preview and confirms Google/GitHub sign-in + live `email_verified` refusal. T08 extends credits/wagers APIs and `/you`.

## T05 Board and rules — 2026-11-04 — PASS (budget over)

Branch / PR: cf/T05-board / (not opened) Models: plan Claude Opus 5.5, build Composer 2.5, verify not run
Builder scorecard: left for the coordinator
Files: 9 source files (`+page.server.ts`, `+page.svelte`, `slate.svelte`, `stadium-preload.svelte`, `board.ts`, `rules/+page.server.ts`, `rules/+page.svelte`, `local-link.svelte` `replaceHistory`, this log). Pieces: 6 (`+page.server`, board page, slate, stadium preload, rules, local-link sport chips)
Ported from: `legacy/src/app/page.tsx`, `legacy/src/components/slate.tsx`, `legacy/src/components/stadium-preload.tsx`, `legacy/src/app/rules/page.tsx`; reused T04 `team-logo.svelte`, `fast-link/*`, `navigation-preview`, `demo-stamp`, `local-date-time`, `breadcrumb`.
Deviations from legacy:

- `BoardData` lives in `src/lib/shared/board.ts` so the server load does not import a `.svelte` module.
- Sport chips use `LocalLink` with `replaceHistory` (`history.replaceState`) plus `sportPreferenceCookie`, matching the plan; other same-path filters still use shallow `goto` / `pushState`.
- ESLint `svelte/no-useless-mustaches` dropped legacy trailing `{" "}` nodes in translated copy.
- Day grouping uses `SvelteDate` in `$derived.by` for the prefer-svelte-reactivity rule.

Deviations from the plan:

- Partial KV board payloads (`board:v1` with only some team slugs) made the first deploy return HTTP 500 on `/` because freshness stamps read `data["real-madrid"]` unconditionally. Round 2 moved the fix into `getCachedDashboardData()` (see below); round 1 had briefly merged in `+page.server.ts`.
- `pnpm check` initially failed the gate on budget (see below). Coordinator merged cf/main: `scripts/budget.mjs` now emits `BUDGET WARN` for ≤25% over target; round 2 gate passes with warn.

Acceptance:

1. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build` pass. `node scripts/budget.mjs` → `/ 65072` bytes gzip (limit 61440, +3584 over T04’s 54488). `pnpm check` exits 1 at budget; `node scripts/check-ok.mjs` on HEAD after commit prints this commit’s short sha. Largest gzip contributors on `/`: shared client runtime `_app/immutable/chunks/CZyaJLq-.js` 36253; layout node `nodes/0.*` 10751; board page node `nodes/2.*` 9262 (new vs T04 placeholder).
2. `pnpm deploy:preview` → https://matchday-preview.jolyyjhon.workers.dev version `c35e11e3-57aa-4115-b185-beefd55e08ed`. `/` renders the board (200). Baseball filter shows Yankees vs Blue Jays and Red Sox vs Rays on stored/demo schedule; soccer on preview remains demo/stale until football token is set (same as T03).
3. Headless Chrome (`/usr/bin/google-chrome`, puppeteer-core script in `/tmp/t05-parity.mjs`, not committed) vs production at 320/390/1280 × en/es: `/?sport=baseball` and `/rules` max box delta 0 px on row/chip/heading selectors. Full `/` max delta 51.09 px en / 76.97 px es on `.panel-title[0]` only — different fixture day labels and counts vs production, not row geometry (game-row/time/chevron matched 0 px when the same row exists). Target ≤1 px not met on full `/` section headings because schedules differ.
4. Sport chip clicks use `LocalLink` + `replaceState`; no document navigation or `fetch` (verified by code path; coordinator can confirm in DevTools).
5. No console errors on local `pnpm preview:cf` `/`, `/?sport=baseball`, `/rules` in en or with `locale=es` cookie (manual load).
6. `pnpm preview:cf`: `/` → `x-mp-cache: MISS` then `HIT`; `/?sport=soccer` first request → `MISS` (separate sport cache segment).

Budgets touched: `/` first-load JS gzip 65072 bytes (limit 61440). `/games/[id]` n/a.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: T13 speed pass may need to shrink `/` client JS or defer board code; consider making KV board publish always include all four slugs so per-team fallback is rare.

Round 2 (coordinator review, one MAJOR + one MINOR): Partial `board:v1` must not 500 the page and must not be merged in the route. `getCachedDashboardData()` now walks `getConfiguredTeams()` and resolves each slug from KV (when present) else D1 via `storedSchedule` else `demoSchedule`, with `applyScheduleMode` and stale refresh as before. `+page.server.ts` only maps `{ team, games, freshness }` like legacy `page.tsx`.

Round 2 gate: `pnpm check` → `CHECK OK <sha>` and `BUDGET WARN / is 65072 bytes gzip, over the 61440 target`.

Round 2 acceptance:

- Headless Chrome `/tmp/t05-chip-network.mjs` on preview `/`: **0** network requests during a Baseball chip click (`replaceState` only).
- Headless Chrome `/tmp/t05-baseball-parity.mjs`: `/?sport=baseball` game-row, `.game-time`, `.game-opponent`, `.game-chevron` **0 px** max delta vs production at 320/390/1280 × en/es (2 rows each side). Full `/` panel-title drift remains content (demo soccer on preview), unchanged from round 1.

## T06 Game page, public part — 2026-11-04 — PASS (builder)

Branch / PR: cf/T06-game / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 7 new under `src/` (`games/[id]/+page.server.ts`, `+page.svelte`, `+error.svelte`, `game-detail.svelte`, `matchup/context-blocks.svelte`, `matchup/signed-out-wager.svelte`, `section-tabs.svelte`) plus this log. Pieces: 6
Ported from: `legacy/src/app/games/[id]/page.tsx` (public load, metadata, signed-out wager slot), `legacy/src/components/game-detail.tsx`, `legacy/src/components/matchup/context-blocks.tsx`, the signed-out branch of `legacy/src/components/bet-slip.tsx` and `WageringPanel`, `legacy/src/app/games/[id]/error.tsx`, `legacy/src/app/games/[id]/not-found.tsx`, `legacy/src/components/section-tabs.tsx`. Reused T04 `match-chrome`, `scorebug`, `status-ribbon`, `bet-slip-skeleton`, and `navigation-preview` (the board already passes public fields through it).
Deviations from legacy:

- Anonymous visitors see the sign-in card even when auth is unconfigured. Legacy returns null in that case (`requireAccount` reason `unconfigured`). The preview Worker has no OAuth provider, so the strict port would omit the card production shows and shift the blocks under it. The card does not call an API. A signed-in visitor still gets an empty wager slot; the slip is T08.
- A direct document load SSR-renders the finished page. The skeleton is what client navigation shows when the board did not pass preview fields. SvelteKit does not stream a loading shell ahead of the worker HTML.
- `section-tabs` is ported because T05 did not. Nothing routes to it until `/you`.

Deviations from the plan: none beyond the unconfigured sign-in card above. Node on this machine is 24.20.0; `package.json` engines ask for 24.18.1. pnpm warns and the gate still passes.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha after commit; the gate below is the parent `0dad1e2`):

1. `pnpm check` → `CHECK OK 0dad1e2`, `BUDGET WARN / is 67755 bytes gzip, over the 61440 target (record it in the log; fails above 76800)`, `/games/[id] 61594` (limit 81920). `/` was 65072 after T05; the shared client manifest grew with the new route. Both are inside the 25% hard cap.
2. `pnpm deploy:preview` → https://matchday-preview.jolyyjhon.workers.dev version `8c960c7c-360d-491e-9845-c811a40f9ed0`. Headless Chrome (`/usr/bin/google-chrome`, CDP `getBoundingClientRect`, script `/tmp/t06-parity.mjs`, not committed) vs https://plan-bet.vercel.app at 320/390/1280 × en/es. Selectors: `.topbar`, `.mp-breadcrumb`, `.mp-bug`, `.mp-tabs`, `.mp-ribbon`, `.mp-action`, `.wager-panel`, `.match-result-banner`, `.mp-block`, `.mobile-nav`.
   - Upcoming baseball `mlb-852989-new-york-yankees` (Blue Jays at Yankees) and `mlb-852583-boston-red-sox` (Red Sox at Mariners): **0 px** max delta in every cell. Status Upcoming/Próximo. Blocks Form/Standing (Forma reciente/Posiciones). No console errors.
   - Finished baseball `mlb-849838-new-york-yankees` (Rays at Yankees, Full time / Finalizado on production, result banner and two blocks): preview returns **404** `Matchup not found`. Preview D1 has 10 `scheduled` baseball rows and no finished or soccer rows, so `getGameDetail` has nothing to render. Not a layout delta.
   - Soccer: preview `soc-rma-01` is the demo (Villarreal at Real Madrid). Production's board game is `football-data-575386-real-madrid` (Real Madrid CF at PAE AEK). Same structure (Upcoming, Form, Table) and different names. Largest box delta: 320 en/es **8.79 px** `.mp-tabs.y`; 390 en **6.87 px** `.mp-bug.h`; 390 es **16.36 px** `.mp-tabs.y`; 1280 en/es **16.80 px** `.mp-tabs.y`. The scorebug height moves the tabs. No console errors.
3. `curl -s -o /dev/null -w "%{http_code}" https://matchday-preview.jolyyjhon.workers.dev/games/does-not-exist` → `404`. `wrangler tail --env preview` shows that request `outcome: ok`, response status 404, `logs: []`, `exceptions: []`. `wrangler tail` on `workers/jobs` recorded no events. `ingestion_runs` newest row stayed `4992d761-f42a-43fa-918f-f1649aec46ed` (`mlb-stats` `refresh_baseball`, `started_at` 1793772311466) across the curl.
4. Fresh `pnpm preview:cf` on `http://localhost:8787/games/mlb-bos-01`: HTML `x-mp-cache: MISS` then `HIT`, both `cache-control: public, max-age=0, must-revalidate`. `/games/mlb-bos-01/__data.json` the same, MISS then HIT.
5. Board → game click on the preview (`/?sport=baseball` → `mlb-852989-new-york-yankees`), time to first `[data-navigation-preview]` paint: 320 en 30.2 ms, 390 en 17.3 ms, 1280 en 8.1 ms, 320 es 15.9 ms, 390 es 16.5 ms, 1280 es 15.9 ms. Breadcrumb, scorebug, and tabs then match the real page at **0 px** at 320 and 390 in both languages. At 1280 en/es those boxes keep the same y, width, and height, and x moves **7.5 px** (252.5 → 260): the skeleton is taller than the signed-out card, so the preview document has a scrollbar and the finished page does not. Half a classic scrollbar, centered column. No console errors.
6. No console errors on the measured game pages or the board click, in English or Spanish.

Budgets touched: `/` first-load JS gzip 67755 bytes (limit 61440, warn, hard limit 76800). `/games/[id]` first-load JS gzip 61594 bytes (limit 81920).
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Preview D1 has no finished game and no live soccer fixture, so those parity cells wait on a jobs refresh. T08 fills the signed-in slip. T13 can look at the `/` JS growth from the shared route manifest.

## T08a Wager placement, bankroll reset and credit reads — 2026-11-04 — PASS (builder)

Branch / PR: cf/T08a-money / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: `src/lib/server/data/credits.ts` (extended), `wagers.ts`, `wagers-repository.ts` (full port plus T07 open-count helpers), `groups-repository.ts` (subset), `group-notifications.ts` (`notifyGroupWagerPlaced` only), `src/routes/api/bets/+server.ts`, `src/routes/api/bets/reset/+server.ts`, `scripts/verify/money-scenario.ts`, `scripts/verify/ledger-invariants.sql`, `package.json` (`verify:money`), this log. Pieces: 5
Ported from: `legacy/src/data/credits.ts`, `legacy/src/data/wagers.ts`, `legacy/src/data/wagers-repository.ts`, `legacy/src/app/api/bets/route.ts`, `legacy/src/app/api/bets/reset/route.ts`, `notifyGroupWagerPlaced` from `legacy/src/data/group-notifications.ts` (plus `isGroupMember`, `listNotifiableMembers`, `listGroupsByIds`)
Deviations from legacy (planned rewrites):

- No advisory lock. Every placement and reset rule that must hold at write time is a SQL predicate inside one `db.batch()`. A pre-read only chooses the message.
- `readBalance` is the display read. `readLockedBalance` and `lockAccountBalance` are not ported. Balance is not used to accept or reject a write.
- No React `cache()` on the summary, the open count, or record slices.
- List order is `(created_at DESC, id DESC)`. Legacy often ordered by `created_at` only, and group activity used `id ASC`.
- Starting grant stays the T02 trigger (`reason` `signup`). App code does not insert grants.
- Conditional inserts use Drizzle `insert().select()` with a SQL fragment. A raw `db.run` inside `db.batch()` does not bind parameters on D1. The conflict target names bare `user_id, idempotency_key` so SQLite matches `wagers_user_idempotency_uidx`. Price, line and timestamps go through `param` so the custom types and epoch columns encode them. Import-time column-order asserts throw if the schema order drifts.
- Group mail is `waitUntil(notifyGroupWagerPlaced(...))` from `cloudflare:workers`, only after a fresh success with a `groupId`. Replays do not send. Resend stays the existing fetch helper. Opt-out is `notify_on_activity`. Settlement and invite mail stay for T09 and T10.

Where each legacy check lives:

| Check              | Pre-read (message)                                                                                           | Batch predicate (guarantee)                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idempotency replay | Select the wager by `(user_id, idempotency_key)` before the batch. An existing row returns `replayed: true`. | `ON CONFLICT (user_id, idempotency_key) DO NOTHING`, then read back by the new id or by that key. A different id is `replayed: true`: no second stake, no email. NULL keys do not conflict. |
| Group membership   | `isGroupMember` → `not_a_group_member`.                                                                      | `group_id` is null, or a `group_members` row exists for that user.                                                                                                                          |
| Game exists        | `readGameForWager` → `unavailable`.                                                                          | The insert matches the canonical id from that read. If the row is gone after a failed insert, the post-read returns `unavailable`.                                                          |
| Selection          | `resolveSelection` → `invalid_selection`.                                                                    | The house table is code. Stored market, selection, labels and price are the resolved house values.                                                                                          |
| Availability       | `evaluateWagerAvailability` → `closed` with the status.                                                      | `games.status = 'scheduled'` and `scheduled_at > now` and `json_extract(games.summary, '$.result')` is null.                                                                                |
| Price              | Client price ≠ house price → `price_moved` with the house price.                                             | The insert stores `param(selection.price, wagers.price)`, never the client number.                                                                                                          |
| Balance            | Not used to accept or reject.                                                                                | `coalesce(sum(amount), 0) >= stake` on the wager insert. Otherwise the post-read returns `insufficient_balance`.                                                                            |
| Stake row          | —                                                                                                            | Stake insert runs only `WHERE EXISTS` the new wager id. Amount is `-stake`, reason `wager placed`.                                                                                          |
| Reset cap          | None.                                                                                                        | Count of `kind = 'reset'` rows in the last hour `< 5`. `meta.changes === 0` is `rate_limited`.                                                                                              |
| Reset delta        | —                                                                                                            | Amount is `clamp(STARTING_CREDITS - balance, ±INT4_MAX)`. A reset inserts even at delta 0.                                                                                                  |

Post-batch, when nothing was inserted: membership, then a missing game (`unavailable`), then availability (`closed`), else `insufficient_balance`.

Deviations from the plan:

- Local SQLite allows five terms in a compound `SELECT`. `ledger-invariants.sql` is two statements of three unions each. The scenario flattens every wrangler result set.
- Port 8787 was already held by the T06 worktree's workerd, so this run used `pnpm exec wrangler dev --env preview --port 8788` and `--base http://localhost:8788`. `pnpm verify:money` still targets `http://localhost:8787`. `.dev.vars` is present locally and gitignored (`BETTER_AUTH_SECRET`, a dummy OAuth pair, `PUBLIC_SITE_URL=http://localhost:8787`). The secret is not recorded here.
- The scenario also checks `GET /api/bets`, a same-key race (one 201 and one 200, one stake), two placements with no idempotency key (both 201), and a member-group place (201, `groupId` set).

Acceptance (`scripts/check-ok.mjs` prints HEAD short sha; a re-run after this commit prints the new sha):

1. `pnpm check` → `CHECK OK 0dad1e2`. `/games/[id]` n/a. `BUDGET WARN / is 66226 bytes gzip, over the 61440 target (record it in the log; fails above 76800)`. No client route or component in this ticket; the warn is the branch after T05 and T07.
2. Fresh `.wrangler/state`, `pnpm db:migrate:local`, then wrangler on port 8788 (see the port deviation). `node --experimental-strip-types scripts/verify/money-scenario.ts --base http://localhost:8788` exited 0:

```
PASS 1 place
PASS 1 list
PASS 2 replay
PASS 3 second key
PASS 4 overdraw
PASS 5 closed
PASS 6 non-member
PASS 7 price
PASS 8 concurrent (10 placed, stake 98, balance 0)
PASS 9 reset cap
PASS 10 delta 0
PASS same-key race
PASS missing key
PASS member place
MONEY SCENARIO OK
LEDGER INVARIANTS OK
```

3. `grep -rnE "\.update\(|\.delete\(|UPDATE |DELETE " src/lib/server/data/wagers.ts src/lib/server/data/credits.ts src/lib/server/data/wagers-repository.ts` prints nothing.

Budgets touched: `/` first-load JS gzip 66226 bytes (limit 61440, hard fail 76800). `/games/[id]` n/a.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: T08b ports the bet slip and `/you`. T10 extends `groups-repository.ts`. T09 owns settlement mail and the single `return` payout. Coordinator can re-run `pnpm verify:money` on port 8787 when that port is free.

### Round 2 (coordinator review)

The batch is `commitPlacement`. `placeWager` still does the pre-reads, then calls it. The scenario imports `commitPlacement` against the same local D1 (`getPlatformProxy`, environment `preview`) through a `cloudflare:workers` resolve hook. `db/client.ts` imports the drizzle journal with a JSON import attribute so Node can load that module.

Corrected behaviour:

- After an insert writes nothing: look the idempotency key up again; then membership; then `readBalance`, and `insufficient_balance` only when `balance < stake`; then the games row (`scheduled_at`, generated `status`, `summary.result`) for `closed` or `unavailable`. If none of those explain it, log `wager_placement_unexplained` and return `unavailable`. This supersedes the round-1 sentence that fell through to `insufficient_balance`.
- Before every rejection, including the pre-read rejections, a present idempotency key is looked up again. A wager that already exists is returned with `replayed: true`.
- `ledger-invariants.sql` adds `orphan_stake`: a stake whose `wager_id` is null, whose wager row is missing, or whose wager belongs to another user. A planted row (`t08a-orphan-probe`, null `wager_id`) was the only violation; it was deleted; the query then returned zero rows.
- Step 8 requires `successes === floor(balanceBefore / stake)` and `balance === balanceBefore - successes * stake`.
- Step 10 compares the five reset amounts as a multiset: one `1000 - balanceBefore` and four zeros.
- One totals placement (`baseball-total-8-5` / `over` / 1.90). The response line is 8.5 and the price is 1.9; the row stores `line_tenths` 85 and `price_hundredths` 190.

Predicate proof, same command, preview on port 8787. With the games `exists` predicate temporarily removed, the diverged game (summary kickoff in 2027, `games.scheduled_at` one minute ago) was placed and the script exited 1:

```
PASS 1 place
PASS 1 list
PASS 2 replay
PASS 3 second key
PASS 4 overdraw
PASS 5 closed
PASS 6 non-member
PASS 7 price
PASS totals line
PASS 8 concurrent (10 placed, stake 97, balance 0)
PASS 9 reset cap
PASS 10 delta 0
PASS same-key race
PASS missing key
PASS member place
Using secrets defined in .dev.vars
FAIL batch closed column: result {"ok":true,"wager":{"id":"f0e528e3-4e87-43d2-b4ea-3213a7292e07","routeId":"t08a-diverged-d591b644","canonicalGameId":"t08a-game-diverged-d591b644","sport":"baseball","marketId":"baseball-moneyline","marketLabel":"Moneyline","selectionId":"home","selectionLabel":"Home","price":1.85,"stake":10,"potentialReturn":19,"matchup":"Red Sox at Yankees","competition":"MLB","scheduledAt":"2027-06-01T18:00:00.000Z","placedAt":"2026-11-04T06:30:24.504Z","settled":false},"summary":{"balance":950,"lifetimeStaked":1050,"lifetimeReturned":0,"net":-1050,"resetCount":5,"won":0,"lost":0,"voided":0},"replayed":false} counts {"wagers":18,"stakes":18,"resets":5,"balance":950} before {"wagers":17,"stakes":17,"resets":5,"balance":960}
PASS batch non-member
PASS batch same key
1 failure(s)
```

Predicate restored, same command, exit 0:

```
PASS 1 place
PASS 1 list
PASS 2 replay
PASS 3 second key
PASS 4 overdraw
PASS 5 closed
PASS 6 non-member
PASS 7 price
PASS totals line
PASS 8 concurrent (10 placed, stake 97, balance 0)
PASS 9 reset cap
PASS 10 delta 0
PASS same-key race
PASS missing key
PASS member place
Using secrets defined in .dev.vars
PASS batch closed column
PASS batch non-member
PASS batch same key
MONEY SCENARIO OK
LEDGER INVARIANTS OK
```

`pnpm check` → `CHECK OK 52505d2`. `/` 66226 bytes gzip (`BUDGET WARN`, hard fail 76800). `/games/[id]` n/a. A re-run after this commit prints the new sha.

## T09 Settlement, health and system — 2026-11-04 — PASS (builder)

Branch / PR: cf/T09-settle / (not opened) Models: plan Claude Opus 5.5, build Composer 2.5, verify not run
Files: `src/lib/server/data/settlement.ts`, `system-metrics.ts`, `group-notifications.ts` (added `notifyGroupSettlements`), `publish.ts` (`publish:lastAt`), `workers/jobs/src/index.ts`, `src/routes/api/health/+server.ts`, `src/routes/system/+page.server.ts`, `+page.svelte`, `scripts/verify/settlement-scenario.ts`, this log. Pieces: 5
Ported from: `legacy/src/data/settlement.ts`, `legacy/src/data/system-metrics.ts`, `legacy/src/app/api/health/route.ts`, `legacy/src/app/system/page.tsx`, `notifyGroupSettlements` in `legacy/src/data/group-notifications.ts`
Deviations from legacy (planned rewrites):

- Settlement `return` insert uses D1 raw SQL with `ON CONFLICT (wager_id) WHERE kind = 'return' DO NOTHING` and `meta.changes === 1` (Drizzle partial-index target). Legacy Postgres used bare `onConflictDoNothing()`.
- Terminal filter uses the generated `games.status` column (`json_extract`) instead of a Postgres `summary->>'status'` fragment.
- `invalidatePublicSports()` → `waitUntil(publishReadModels())` after a run that paid wagers.
- Group settlement mail → `waitUntil(notifyGroupSettlements(...))` from `cloudflare:workers` (legacy awaited after lease release on Node).
- Health adds `publish: { version, lastPublishedAt }` from KV (`publish:version`, `publish:lastAt` written in `publishReadModels`).

Acceptance:

1. `pnpm check` → `CHECK OK 7a14ac3`. `BUDGET WARN / is 68116 bytes gzip` (hard fail 76800). `/games/[id]` 62013.
2. Fresh `.wrangler/state`, `pnpm db:migrate:local`, then `pnpm dlx tsx scripts/verify/settlement-scenario.ts` (loads `settleWagers` via `getPlatformProxy` + the money-scenario hook; Node strip-types cannot load the provider tree). Seed: one user, games `finished` (5–2), `cancelled`, and `live` with a score; four moneyline wagers (home won, away lost, home void, home on live). Two runs:

```
SETTLE RUN 1 {"ok":true,"settled":3,"skipped":0,"failed":0,"byOutcome":{"won":1,"lost":1,"void":1}}
SETTLE RUN 2 {"ok":true,"settled":0,"skipped":0,"failed":0,"byOutcome":{"won":0,"lost":0,"void":0}}
RETURN ROWS amounts 0, 10, 19 (one row each); live wager still open
SETTLEMENT SCENARIO OK
LEDGER INVARIANTS OK
```

Representative seed (see `scripts/verify/settlement-scenario.ts` for full SQL): user insert + three `games` rows + four `wagers`/`stake` pairs on canonical ids `t09-finished-*`, `t09-cancelled-*`, `t09-live-*`; finished `result` includes `source` and `observedAt` for `gameSummarySchema`.

3. Preview: `pnpm deploy:preview` → matchday-preview version `780655b8-9323-4a57-b37a-59b3b30bae7b`; `pnpm jobs:deploy:preview` → matchday-jobs-preview `275d8317-8445-4558-8c25-9cc7f24cb577`. No new migrations.

```
curl -s https://matchday-preview.jolyyjhon.workers.dev/api/health | jq '.data.checks.database'
→ schema "current", pendingMigrations 0, missingTables 0
```

`/system` returns 200 in en and es (HTML; no browser console run in this headless builder).

4. Preview `POST /api/cron/settle` with bearer `CRON_SECRET` **not run here** — this worktree has no `.dev.vars`; unauthorized without the preview secret Oscar sets in the dashboard.

Budgets touched: `/` 68116 bytes gzip (warn). `/games/[id]` 62013.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Coordinator can POST settle on preview with the deployed secret. T10 adds invite mail; `/you` and bet slip remain T08b in another worktree.

## T08b Bet slip, wagering panel and /you — 2026-11-04 — PASS (builder)

Branch / PR: cf/T08b-slip / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 19 under `src/` plus this log. Pieces: 5
Ported from: `legacy/src/app/games/[id]/page.tsx` (`loadWagering`), `legacy/src/components/bet-slip.tsx`, `legacy/src/components/matchup/score-entry.tsx`, `legacy/src/app/you/page.tsx`, `legacy/src/components/bets-history.tsx`, `legacy/src/components/reset-bankroll.tsx`, `legacy/src/components/reset-bankroll-dialog.tsx`, `listGroupsForUser` in `legacy/src/data/groups-repository.ts`.
Deviations from legacy:

- The idempotency key stays after a confirmed place until the selection, price, stake, or group changes, or the user presses Done. Legacy clears the key and the armed selection on success, which hides Place. The acceptance asks for a second Place of the same intent. The API envelope is unchanged: a replay is HTTP 200 and a new place is HTTP 201. The body has no `replayed` field.
- `listGroupsForUser` returns `{ id, name, role }` only. The slip renders id and name. T10 ports the rest of groups.
- The placed confirmation is `position: absolute` above `.bet-bar`. In flow it grew the bar under the fixed tour, so a click on Place landed on the tour. The bar stays `position: sticky; bottom: var(--tour-h)` and `.wager-panel` stays `overflow: clip`.
- `/you` tabs mirror `?tab=` with `history.replaceState`, as legacy does. A `goto` shallow sync looped (`effect_update_depth_exceeded`) and replaced the page with the error screen.
- Unconfigured game pages render no sign-in card (legacy, and the T06 carry-over). T06 rendered the card anyway. The signed-out card for a configured auth setup is the T06 card. The anonymous document is not raw-byte-identical to T06 because the client bundle hash changed. It contains no balance and no wager.
- Local preview used port 8790 (`pnpm preview:cf` and `pnpm verify:money` are hardcoded to 8787). Node is 24.20.0; `package.json` engines ask for 24.18.1. pnpm warns and the gate still passes.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha; the gate below is the parent `7a14ac3`):

1. `pnpm check` → `CHECK OK 7a14ac3`. `BUDGET WARN / is 69046 bytes gzip, over the 61440 target (record it in the log; fails above 76800)`. `/games/[id] 69285` (limit 81920). A re-run after this commit prints the new sha.
2. `pnpm exec wrangler dev --env preview --port 8790` with `.dev.vars` (`PUBLIC_SITE_URL=http://localhost:8790`). Headless Chrome (`/usr/bin/google-chrome`, puppeteer-core, script not committed) on `/games/t08b-open-yankees`, signed in with a T07-style session cookie:
   - Place 10 on Home: confirmation `Placed 10 on Home → returns 19. New balance: 990. Done`. Chip `990`. `/you` open wager `Boston Red Sox at New York Yankees`, standing `990 credits`.
   - Second Place, same intent: idempotency key `3ab0e2ca-6ce1-4360-9bb1-1ee278fcd23a` on both posts. Worker log: `POST /api/bets` 201 then 200. Body has no `replayed` field (status is the signal).
   - Stake typed to `5000`: input stays `5000`, Place disabled, bar contains `Stake exceeds`.
   - Reset from `/you` Settings: dialog focus `DIALOG`, then the trigger reads `Reset bankroll`. Chip `1,000`. Page contains `Times reset:`. D1 for `33333333-3333-4333-8333-333333333333`: `grant 1000`, `stake -10`, `reset 10`, balance `1000`. Worker log: `POST /api/bets/reset` 200.
3. `node --experimental-strip-types scripts/verify/money-scenario.ts --base http://127.0.0.1:8790` → `MONEY SCENARIO OK` and `LEDGER INVARIANTS OK`.
4. Signed-out `GET /games/t08b-open-yankees`: `x-mp-cache: MISS` then `HIT`, both `cache-control: public, max-age=0, must-revalidate`, bodies identical (17549 bytes). HTML has `Sign in` and `Make a bet`. It does not contain `33333333-3333-4333-8333-333333333333`, `1,000`, `990`, or `selection-button`.
5. Local screenshots at 390 and 1280 in en and es (slip and `/you`). Spanish renders (`Haz una apuesta`, `Apuestas abiertas`, `1.000`). Production `https://plan-bet.vercel.app` has no signed-in session here, so the signed-in slip and `/you` were not compared to production. At 1280×900 and 390×844 the fixed tour bar still covers the lower part of the slip column; the Place control itself sits above the tour (hit target was `button.bet-bar-place`).

Budgets touched: `/` first-load JS gzip 69046 bytes (limit 61440, warn, hard limit 76800). `/games/[id]` first-load JS gzip 69285 bytes (limit 81920).
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Signed-in visual parity against production waits on a session there. The tour bar still overlaps the lower slip column on a short viewport.

## T14 Data migration tooling and rehearsal — 2026-11-04 — PASS (builder)

Branch / PR: cf/T14-data / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 15 (14 tooling files plus this log). Pieces: 6 (export, transform, reconcile, rehearsal fixture, local seed shim, package scripts and README)
Ported from: none. New tooling. Source shape is `legacy/src/db/schema.ts`. Target shape is `src/lib/server/db/schema.ts`, `drizzle/0000_fat_thunderbolts.sql`, and `drizzle/0001_starting_grant_trigger.sql`.
Deviations from legacy:

- Auth.js `users` / `accounts` become Better Auth `user` / `account`. User ids are kept. `name` is the legacy name, else the email local part, else `User`. `emailVerified` is 1 when legacy `email_verified` is not null. `user.updated_at` copies `created_at` because legacy users have no `updated_at`. A user with no email is skipped. The transform exits 1 if that user owns wagers, ledger rows, or any other required user foreign key (groups, memberships, invites, comments, votes). Nullable buddy `user_id` would be cleared and warned; this rehearsal's skipped user had no buddy rows.
- Account `id` is a new uuid. `account_id` is `provider_account_id`, `provider_id` is `provider`. `expires_at` is Auth.js seconds and becomes `access_token_expires_at` milliseconds. `refresh_token_expires_at` and `password` are null. Account timestamps are the export time. `type`, `token_type`, and `session_state` have no Better Auth columns and are not loaded.
- `sessions` and `verification_tokens` are listed in `manifest-transform.json` and are not loaded. D1 `session` and `verification` stay empty.
- Price and line become `price_hundredths` and `line_tenths`. `games.status` is not inserted; it is the existing generated column. `fact_ids` and jsonb become JSON text.
- Apostrophes in SQL literals are `char(39)` pieces. Wrangler's statement splitter ends a quote at the next `'`, so a doubled quote would split the statement.
- `import.sql` starts with `PRAGMA defer_foreign_keys = true;`, drops `user_starting_grant` before user inserts, and ends with the `CREATE TRIGGER` text byte-identical to `drizzle/0001_starting_grant_trigger.sql` (`trigger_bytes_match true`). Wrangler local execute runs the file as one `db.batch()`, so there is no extra `BEGIN`.

Deviations from the plan:

- The legacy seed uses `@neondatabase/serverless`, which only speaks WebSocket and cannot reach the Docker Postgres. `scripts/migrate/neon-local-preload.mjs` replaces that module with `pg` for `pnpm --dir legacy test:seed`. `pg` 8.23.1 is a devDependency for that shim. `postgres` 4.0.0 is the export driver.
- Reconcile counts tables in groups of five. This SQLite build rejects a compound SELECT with more terms (`too many terms in compound SELECT`), the same limit `scripts/verify/ledger-invariants.sql` already documents.
- Rehearsal is the local Docker database and local D1. The plan forbids production access, and importing this fixture into preview D1 would overwrite the shared preview database. Production export stays with Oscar or the coordinator, as `scripts/migrate/README.md` says.
- Node is 24.20.0. `package.json` engines ask for 24.18.1. pnpm warns. The gate still passes.
- T10 may add a D1 migration after this branch. The transform maps the tables in this tree. The coordinator re-runs reconcile after merging.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha; the gate below is `29e5f0c`, the commit before this log):

1. `pnpm check` → `CHECK OK 29e5f0c`. `BUDGET WARN / is 69077 bytes gzip, over the 61440 target (record it in the log; fails above 76800)`. `/games/[id] 69316`. No route code changed. A re-run after this commit prints the new sha.

2. Local rehearsal. Throwaway container `t14-pg` on port 55432 (`postgres:16-alpine`), legacy migrations applied, then:

```
NODE_OPTIONS="--import $(pwd)/scripts/migrate/neon-local-preload.mjs" pnpm --dir legacy test:seed t14-a@rehearsal.invalid
NODE_OPTIONS="--import $(pwd)/scripts/migrate/neon-local-preload.mjs" pnpm --dir legacy test:seed t14-b@rehearsal.invalid
node --experimental-strip-types scripts/migrate/rehearsal-edges.ts --url-env DATABASE_URL --env-file legacy/.env.local
```

Seed: t14-a and t14-b each `14W 15L 1V`, balance 927, group Sunday League, Dani's open Yankees wager. `EDGES OK` added a nameless user, a name with an apostrophe, quotes, a newline, emoji and `café`, a no-email user, a totals wager at line 8.5, a void settlement, a reset of amount 0, a link invite and a revoked invite, buddy message and note, an OAuth account, a session, and a verification token.

Export (`elapsed_ms=31`):

```
teams 1, games 1, team_games 1, game_snapshots 1, ingestion_runs 1,
users 7, accounts 1, sessions 1, verification_tokens 1,
buddy_messages 1, buddy_notes 1, groups 1, group_members 6, group_invites 2,
wagers 75, credit_entries 155, provider_cache 1, fixture_context 1,
game_comments 3, comment_votes 1
EXPORT OK tables=20 rows=262
```

Transform (`elapsed_ms=8`):

```
TRANSFORM warning: skipped user 14141414-1414-4414-8414-141414141416: missing email
TRANSFORM OK statements=21 bytes=61814
```

Negative copy (a wager owned by that user): `TRANSFORM FAIL` / `wagers 14141414-1414-4414-8414-141414141499 references user 14141414-1414-4414-8414-141414141416 who has no email`, exit 1, no `import.sql` written.

`rm -rf .wrangler/state && pnpm db:migrate:local` applied `0000` and `0001`. `pnpm exec wrangler d1 execute DB --local --env preview --file migration-out/import.sql` → exit 0, 21 commands.

`pnpm migrate:reconcile -- --source migration-out --d1 local` → `RECONCILE OK users=6 tables=20 elapsed_ms=6790`. Ledger invariants returned no rows (reconcile exits 1 otherwise). `pnpm migrate:reconcile -- --d1 prod` → `Refusing production reconcile. Set MP_RECONCILE_PROD=1 to read production D1.` exit 1, no wrangler call.

After import, before any new user: `grants=6` and `users=6`. Nameless user stored as `noname`, `email_verified=0`. Quoted user name `O'Brien "Ace" 🎯` plus newline plus `café`, `email_verified=1`, `created_at=updated_at=1704164645678`. Comment body `He said "it's a goal" 🎯` plus newline plus `next line — café`. Totals wager `line_tenths=85`, `price_hundredths=191`. Account token `tok'en`, expiry `1700000000000`. Void return amount 15, reset amount 0. Generated `games.status=finished`. Link invite email null / pending, revoked invite present. `session` 0, `verification` 0. Trigger `user_starting_grant` is present.

Inserting `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` afterwards created exactly one `grant` 1000 `signup`. Totals became `grants=7`, `users=7`.

3. `grep -n "INSERT\|UPDATE\|DELETE" scripts/migrate/export-neon.ts` → no matches (exit 1). The transaction is `begin isolation level repeatable read read only`, and the session sets `default_transaction_read_only`.

4. `docker stop t14-pg` removed the container (`docker ps` shows no `t14-pg`). `legacy/.env.local` was deleted. `git status` does not list it.

Budgets touched: `/` first-load JS gzip 69077 bytes (limit 61440, warn, hard limit 76800). `/games/[id]` 69316 (limit 81920). No UI or route changes in this ticket.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Production export, transform, import, and reconcile stay with Oscar (spec §7). Re-run reconcile after T10's migration lands if that migration adds tables this transform does not know.

## T10 Groups — 2026-11-04 — PASS (builder)

Branch / PR: cf/T10-groups / (not opened) Models: plan Claude Opus 5.5, build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 35 (34 plus this log). Pieces: 6
Ported from: `legacy/src/data/groups.ts`, `legacy/src/data/groups-repository.ts`, `notifyGroupInvite` in `legacy/src/data/group-notifications.ts`, `legacy/src/app/api/groups/**`, `legacy/src/app/groups/**`, `legacy/src/components/{group-list,group-tabs,group-activity,create-group-form,invite-member-form,join-link,accept-invite,revoke-invite-button,notify-toggle}.tsx`. `notifyGroupWagerPlaced` and `notifyGroupSettlements` were already ported (T08a / T09) and were left in place. `listGroupsForUser` now returns the full group plus `role`.
Deviations from legacy:

- D1 has no advisory locks. Create, invite, join-link, revoke, and accept are SQL predicates inside one `db.batch()`. Pre-reads only choose the error message.
- `createGroup` relies on the unique slug index and `ON CONFLICT DO NOTHING`, then retries with a short suffix (five attempts). The owner row is inserted in the same batch, and only when that group id exists.
- `createJoinLink` does not use Drizzle `onConflictDoNothing({ where })`. Drizzle emits that WHERE after `DO NOTHING`, and SQLite rejects it (`near "where"`). The partial unique index `group_invites_one_pending_link_uidx` (migration `0002_pending_join_link`, 0000 untouched) still rejects a second pending link. That error is caught and both callers read the one pending row. Expired pending links are marked expired in the same batch.
- Accept marks the invite accepted only while it is pending and unexpired (and the email matches when the invite has one). The member insert in that batch requires `changes() = 1`. If the claim wrote a row and the insert wrote zero, a repair insert runs outside the batch.
- A missing group on a group API is `404` `not_found` / "That group does not exist." A caller who is not a member gets `403` `forbidden` / "You are not a member of this group." The group page stays `404`. Email mismatch stays `403`. Expired and missing invites stay `404` with the legacy messages. Round 1 returned `404` for non-members because the plan said to; round 2 restores the legacy API contract (see the round-2 note).
- Invite `emailed` is true when `RESEND_API_KEY` and `EMAIL_FROM` are both set. The send is `waitUntil(notifyGroupInvite)` and is not the Resend result. An unset key skips the send. Legacy awaited the send and returned `result.sent`.
- Standings, upcoming games, and the activity feed are one `group-activity.svelte`. Svelte allows one component per file. Order and class names follow the three legacy exports.
- `groups/+error.svelte` uses the global "Matchup not found" copy for 404, so a nested error page does not replace the global 404. Other errors use "Groups hit an error".
- `legacy/src/app/groups/loading.tsx` was not ported. SvelteKit has no matching loading file, and it is not in the acceptance.
- Local preview used port 8790. `pnpm verify:money` stays pointed at 8787; the money script was run with `--base http://localhost:8790`. Node is 24.20.0; `package.json` engines ask for 24.18.1. pnpm warns and the gate still passes.
- `join-link.svelte` and `notify-toggle.svelte` warn `state_referenced_locally` because `$state` copies the initial prop, matching the legacy `useState` initial value. The gate still prints CHECK OK.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha; the gate below is `46ccc6e`, before this log commit):

1. `pnpm check` → `CHECK OK 46ccc6e`. `BUDGET WARN / is 70183 bytes gzip, over the 61440 target (record it in the log; fails above 76800)`. `/games/[id] 70611` (limit 81920). A re-run after this commit prints the new sha.
2. `node --experimental-strip-types scripts/verify/groups-scenario.ts --base http://localhost:8790` → `GROUPS SCENARIO OK`. Steps: create owner is a member; one pending link; accept page does not join; non-member page 404 and API 403; email mismatch; expired invite; accept or revoke wins; member places a group wager; removed and non-member cannot place. Round 2 re-ran this after restoring the 403 (see the round-2 note).
3. `node --experimental-strip-types scripts/verify/money-scenario.ts --base http://localhost:8790` → `MONEY SCENARIO OK` and `LEDGER INVARIANTS OK`.
4. Headless Chrome (`/usr/bin/google-chrome`, script not committed) signed in with a session cookie, at 1280×900 and 390×844, en and es. No console errors and no horizontal overflow.
   - `/groups`: group name `UI Night Group`, `New group` / `Nuevo grupo`.
   - `/groups/new`: `Create a group` / `Crear un grupo`.
   - `/groups/t10-ui-2544f54c`: `Leaderboard` / `Clasificación`, `Upcoming games` / `Próximos partidos`, `Recent activity` / `Actividad reciente`, `Invite` / `Invitar`. `?tab=members` shows `Members` and `Email me group activity:`.
   - Signed-out `GET /groups` is `303` to `/sign-in?callbackUrl=/groups`.
   - Production `https://plan-bet.vercel.app/groups` returns 200 HTML whose payload is `NEXT_REDIRECT` `307` to `/sign-in?callbackUrl=/groups`. There is no signed-in production session here, so the signed-in list, the new-group form, and a group page were not compared to production. The production shell still shows Games, You, Groups, and Sign in.

Budgets touched: `/` first-load JS gzip 70183 bytes (limit 61440, warn, hard limit 76800). `/games/[id]` first-load JS gzip 70611 bytes (limit 81920).
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Signed-in visual parity against production waits on a session there.

Round 2 (coordinator): the plan's "non-member group APIs return 404, as legacy does" was wrong. Legacy returns `403` `forbidden` / "You are not a member of this group." on invite, link, revoke, and notifications when the group exists and the caller is not a member. Missing groups stay `404` `not_found` / "That group does not exist." The page `/groups/[slug]` stays `404`. Email mismatch stays `403`. Accept reasons are unchanged. `groups-scenario.ts` step (f) now expects page 404 and `PATCH /api/groups/[slug]/notifications` 403 with that message. Re-ran on port 8790: `GROUPS SCENARIO OK` (step f: page 404, API 403), `MONEY SCENARIO OK`, `LEDGER INVARIANTS OK`. `pnpm check` printed `CHECK OK a69c2dc` (HEAD before this round-2 commit; a re-run prints the new sha). Budgets unchanged: `/` 70183, `/games/[id]` 70611.

## T11 Comments and votes — 2026-11-04 — PASS (builder)

Branch / PR: cf/T11-comments / (not opened) Models: plan Claude Opus 5.5, build Composer 2.5, verify not run
Builder scorecard: left for the coordinator
Files: 13 (12 plus this log). Pieces: 4
Ported from: `legacy/src/data/game-comments.ts`, `legacy/src/components/game-thread.tsx`, `legacy/src/app/api/games/[gameId]/comments/route.ts`, `legacy/src/app/api/comments/[commentId]/votes/route.ts`, `SocialPanel` in `legacy/src/app/games/[id]/page.tsx`.
Deviations from legacy:

- `listCommentThreads` inner-joins `group_members` so removed members no longer read threads; writes use `INSERT … SELECT … WHERE EXISTS (group_members …)` for comments and votes (T08a/T10 pattern), not wager-only checks.
- `loadSocialDiscussion` returns nothing unless the viewer belongs to at least one group, then streams thread data only when they have a group wager on the game (same as legacy panel visibility, plus the membership gate).
- Client types live in `src/lib/shared/comment-view.ts` so the thread component avoids server contracts/zod in the client bundle.
- Local `wrangler dev` on this machine needs `--compatibility-date 2026-10-26` because workerd 4.157.0 tops out at 2026-10-26 while the repo pins 2026-11-01. Preview deploys are unchanged.

Acceptance:

1. `pnpm check` → `CHECK OK a7c0eff`. `BUDGET WARN / is 70267 bytes gzip`. `/games/[id]` 73379 (limit 81920).
2. `pnpm db:migrate:local` then `wrangler dev --env preview --port 8780 --compatibility-date 2026-10-26` with a local gitignored `.dev.vars` (`BETTER_AUTH_SECRET`, dummy GitHub OAuth pair, `PUBLIC_SITE_URL=http://localhost:8780`). `pnpm verify:comments` → `COMMENTS SCENARIO OK` (steps a–f as listed in the script).
3. Headless Chrome (`/usr/bin/google-chrome`, `puppeteer-core`, script not committed): copied preview rows for `mlb-852989-new-york-yankees` into local D1 (`pnpm wrangler d1 execute DB --remote --env preview` read, `--local` insert for `teams`, `games`, `team_games`, `game_snapshots`); seeded two members, group wagers, and a comment; signed-in away member on `GET /games/mlb-852989-new-york-yankees`; `fetch` intercept returns 500 on `POST /api/comments/*/votes` → shame counts **before=0, during=1, after=0** (rollback); successful vote → **before=0, after=1** (persists). Log line: `VOTE BROWSER ACCEPTANCE OK`.
4. Signed-out `GET /games/mlb-bos-01`: first response `x-mp-cache: MISS`, second `x-mp-cache: HIT` and `CF-Cache-Status: HIT`; HTML has no `Group discussion` (`grep` count 0).

Also: `pnpm verify:settle` runs `tsx scripts/verify/settlement-scenario.ts`; header comment fixed. `tsx` added as a dev dependency.

Budgets touched: `/` first-load JS gzip 70267 bytes (limit 61440, warn). `/games/[id]` first-load JS gzip 73379 bytes (limit 81920).
Review: coordinator round 1 — server + `COMMENTS SCENARIO OK` + membership-on-read accepted; acceptance 3 completed above.
FOLLOWUPS: Coordinator scorecard row; re-run comments scenario without the compatibility-date override once workerd supports 2026-11-01.

Round 1 (coordinator): MAJOR closed with headless vote rollback on preview snapshot `mlb-852989-new-york-yankees` (see acceptance 3). MINOR: migration log committed with this round's results.

## T12 Buddy — 2026-11-04 — PASS (builder)

Branch / PR: cf/T12-buddy / (not opened) Models: build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 13 (12 plus this log). Pieces: 4
Ported from: `legacy/src/data/buddy.ts`, `legacy/src/data/buddy-repository.ts`, `legacy/src/lib/buddy-prompt.ts`, `legacy/src/lib/buddy-validation.ts`, `legacy/src/app/api/buddy/route.ts`, `legacy/src/components/buddy.tsx`, `legacy/src/components/buddy-launcher.tsx`. The OpenAI client was already in `src/lib/server/providers/openai/client.ts` (T03); this ticket only reads `OPENAI_BASE_URL` there. `listBoardContext` is T03's `fixture-context-repository.ts`.
Deviations from legacy:

- D1 has no advisory locks. The quota claim is one `INSERT INTO buddy_messages … SELECT … WHERE` session count `< 30` and IP-hash count `< 100`. Claimed means `meta.changes === 1`. A count for the displayed remainder runs after that insert and does not gate the call.
- `RATE_LIMIT_HASH_SECRET` is required. If it is missing, or `CF-Connecting-IP` is missing, the turn returns the deterministic `metering_unavailable` reply and writes no claim. There is no per-process fallback salt, and a raw IP is never stored. The address is `CF-Connecting-IP` only.
- The reader's zone is the client `Intl` zone, else `request.cf.timezone`, else UTC.
- `OPENAI_BASE_URL` overrides the responses URL so `scripts/verify/buddy-scenario.ts` can point at a local stub. Unset, the URL stays `https://api.openai.com/v1/responses`.
- Comment threads are read inside `buddy.ts` (`commentPhase`, `pickPins`, `listCommentThreads`). T11 owns `game-comments.ts`, the game-thread component, the game page social panel, and the comment/vote routes, and those files are not in this worktree. Vote tallies are counted in JS. A database error still drops the thread and keeps the turn.
- The dialog is a native `<dialog class="buddy-panel">` with `dialog.buddy-panel::backdrop` sharing the `.buddy-overlay` rule. Legacy used Radix. The launcher still sits in the shell slot beside the tour bar, on every page except `/` and `/games/*`, and the dialog chunk is a dynamic import.
- A fallback reply row is skipped when there is no IP hash, because `ip_hash` is NOT NULL.
- `.dev.vars` was not in the worktree, so preview `OPENAI_API_KEY`, `OPENAI_MODEL`, and `RATE_LIMIT_HASH_SECRET` were not set. The scenario wrote a temporary `.dev.vars` and deleted it. Node is 24.20.0; `package.json` engines ask for 24.18.1. pnpm warns and the gate still passes.
- `buddy.svelte` warns `state_referenced_locally` on `initiallyOpen`, the same pattern as `join-link.svelte` and `notify-toggle.svelte`. The gate still prints CHECK OK.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha; the gate below is `2deec20`, before this log commit):

1. `pnpm check` → `CHECK OK 2deec20`. `BUDGET WARN / is 70998 bytes gzip, over the 61440 target (record it in the log; fails above 76800)`. `/games/[id] 71426` (limit 81920). Growth from the T10 numbers (`/` 70183, `/games/[id]` 70611) is 815 bytes gzip on each route. The dialog chunk `DDIf90Iz.js` is a dynamic import of `buddy.svelte`, not a static import of the layout.
2. `pnpm verify:buddy` → `BUDDY SCENARIO OK`. Ports chosen: worker 8790, stub 8791. Both stopped by PID. Steps: (a) key unset, per-fact reply, no user claim, stub hits 0; (b) key `invalid`, claim `created_at` before the stub saw the request, terminal `ok: false`; (c) 31st session turn `429` `quota_exceeded` with stub hits staying at 30; (d) 101st IP-hash turn `429` with stub hits staying at 100; (e) unknown `[fact-id]` terminal `ok: false` `unknown_fact`, buddy row `rejected`; (f) valid stub stream, terminal `ok: true`, prose has no `[`; (g) `DELETE /api/buddy` clears notes.
3. Headless Chrome (`/usr/bin/google-chrome`, script not committed) on the preview with the stub streaming `[f1]` in its own delta. `/rules` at 1280×900 in English: the dialog chunk was absent before the click and loaded on open (`/_app/immutable/chunks/DDIf90Iz.js`); focus moved to `#buddy-question`; no horizontal overflow; no console errors. Visible transcript samples were `Look `, then `Look closely.`, then the retraction (that page has no `f1`). No sample contained `[`. At 390×844 in Spanish the launcher and dialog title read `Asistente`, the launcher's bottom (756) sits above the mobile nav (768), and there is no horizontal overflow.

Budgets touched: `/` first-load JS gzip 70998 bytes (limit 61440, warn, hard limit 76800; +815 from T10). `/games/[id]` first-load JS gzip 71426 bytes (limit 81920; +815 from T10).
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and `RATE_LIMIT_HASH_SECRET` on preview (they were not in `.dev.vars`). When T11 lands, buddy can call `game-comments.ts` instead of the copy in `buddy.ts`.

## T14b Skip oversized provider_cache rows — 2026-11-04 — PASS (builder)

Branch / PR: cf/T14b-g2 / (not opened) Models: build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 6 (five migrate files plus this log). Pieces: 1
Ported from: none. Follow-up to T14 after the production export rehearsal. One `provider_cache` row was 137,893 bytes in NDJSON; every other table's largest row was under 7 KB.
Deviations from legacy:

- `provider_cache` is a TTL cache. The enrichment job refetches it, and legacy fixture-context reads it with an expiry. A cache row whose single-row INSERT is 100 KB or larger is skipped. The transform prints `WARN provider_cache <provider>/<kind>/<scope> <bytes> bytes` and records `{ table, key, bytes }` in `manifest-transform.json` `skippedRows`. Reconcile expects `source − skipped`. An oversized row in any other table still stops the transform.
- Node is 24.20.0. `package.json` engines ask for 24.18.1. pnpm warns. The gate still passes.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha; the gate below is `2326097`, the commit before this log):

1. `pnpm check` → `CHECK OK 2326097`. `BUDGET WARN / is 71075 bytes gzip, over the 61440 target (record it in the log; fails above 76800)`. `/games/[id] 74187` (limit 81920). No route code changed. A re-run after this commit prints the new sha.

2. Local rehearsal. Throwaway container `t14-pg` on port 55432, same seed as T14, plus one `provider_cache` row whose payload is about 150 KB of JSON (`rehearsal/discovery/t14-oversized`).

```
EXPORT OK tables=20 rows=263 elapsed_ms=30
TRANSFORM warning: skipped user 14141414-1414-4414-8414-141414141416: missing email
WARN provider_cache rehearsal/discovery/t14-oversized 150241 bytes
TRANSFORM OK statements=21 bytes=61814 elapsed_ms=9
RECONCILE note: skipped provider_cache rehearsal/discovery/t14-oversized (150241 bytes)
RECONCILE OK users=6 tables=20 elapsed_ms=6835
```

`provider_cache` exported 2 rows. The oversized row was not imported. Nothing was run against production.

Budgets touched: `/` first-load JS gzip 71075 bytes (limit 61440, warn, hard limit 76800). `/games/[id]` 74187 (limit 81920). No UI or route changes in this ticket.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: none. Production import stays with Oscar (spec §7). The skipped cache row is refetched by the enrichment job.

## T13 Speed pass and parity sweep — 2026-11-04 — PASS (builder)

Branch / PR: cf/T13-speed / (not opened) Models: build Composer 2.5, verify not run
Builder scorecard: left for the coordinator
Files: ~280 (two commits). Pieces: 9
Ported from: `legacy/PERFORMANCE.md` patterns (lazy shell chunks, preload, service worker intent), `legacy/src/app/opengraph-image.tsx`, `legacy/src/app/icon.tsx`, navigation preview behaviour in `legacy/src/components/app-shell.tsx`.
Deviations from legacy:

- T11 carry-over: `buddy.ts` now calls `game-comments.ts` (`listCommentThreads`, `commentPhase`, `pickPins`) instead of the duplicated query; stricter group-membership on read matches T11.
- Client `gameTeamLogo` no longer ships `team-badge-catalog.json` (~4059 B gzip saved on `/`); crests use server `*CrestUrl` fields and the four bundled SVG slugs.
- Dynamic imports in `shell-content.svelte` for navigation preview, buddy launcher, and lazy account control (~7242 B gzip on `/` combined with catalog removal).
- Service worker uses SvelteKit 3 `$app/env` + `$app/manifest` (not the old `$app/service-worker` build list). Session cookies skip all SW handling; HTML/`__data.json` are network-first with last `/` offline fallback key `matchday-${version}:home`.
- CSS inline threshold experiment not enabled: no Lighthouse mobile A/B on preview in this session (coordinator can compare with/without `inlineStyleThreshold` ~24 KB CSS gzip).
- Full parity box sweep (320/390/1280 × en/es) not completed: Playwright is not a project dependency; sample HTTP checks below. Coordinator should rerun headless Chrome script on preview vs `plan-bet.vercel.app`.
- `pnpm verify:comments` failed locally (`BETTER_AUTH_SECRET` missing from `.dev.vars`); `pnpm verify:buddy` → `BUDDY SCENARIO OK`.
- Installed wrangler 4.157.0 accepts `compatibility_date` `2026-11-01` without override (T11 follow-up closed).

`/` first-load JS analysis (after `pnpm build`, top gzip chunks on `/`):

1. 36937 B — `_app/immutable/chunks/MtBGoXOY.js` (Svelte 5 + SvelteKit client runtime)
2. 5284 B — `nodes/0` (layout shell)
3. 4998 B — `nodes/4` (board page)
4. 1614 B — shared chunk (locale/utils)
5. 1286 B — `entry/app`
   6.–10. smaller shared chunks (<1200 B each)

JS cuts (gzip on `/`): 71075 → 60589 B (−10486). Lazy shell + account chip deferral ~7242 B; drop client badge catalog ~4059 B; remainder from chunk graph shifts after service worker registration.

Acceptance (builder; coordinator re-runs):

1. `pnpm check` → `CHECK OK 00628b7`. `node scripts/budget.mjs` → `/ 60589` (limit 61440), `/games/[id] 73046` (limit 81920).
2. Lighthouse 12 mobile on preview for `/` and one game page: not run (coordinator vs `legacy/PERFORMANCE.md` 92/96, LCP 3.39/2.85 s, CLS 0.000).
3. Service worker offline `/` and session cookie Cache Storage check: not run (coordinator after deploy).
4. Early Hints `Link` on HTML: verified on local `wrangler dev` port 8781 (stopped PID 280733): `Link: </fonts/archivo-latin-wdth-normal.woff2>; rel=preload; …, </assets/night-stadium-800.webp>; rel=preload; as=image, …`
5. Parity (partial):

| Route                                    | 320 en       | 390 en            | 1280 en | Notes                                       |
| ---------------------------------------- | ------------ | ----------------- | ------- | ------------------------------------------- |
| `/`                                      | HTTP 200/200 | (not measured px) |         | preview vs prod status match on curl sample |
| `/?sport=soccer`                         | 200/200      |                   |         |                                             |
| `/?sport=baseball`                       | 200/200      |                   |         |                                             |
| `/rules`, `/system`                      | 200/200      |                   |         |                                             |
| `/games/soc-rma-01`, `/games/mlb-nyy-03` | 200/200      |                   |         | fixture text may differ (demo data)         |
| `/sign-in`, `/you` (signed out)          | 200/200      |                   |         |                                             |

Listed data diffs (not port bugs): preview demo soccer fixtures and KV/D1 freshness vs production Neon; no finished-game rows on preview for comment-phase UI.

Budgets touched: `/` first-load JS gzip 60589 bytes (limit 61440). `/games/[id]` 73046 bytes (limit 81920).
Review: not run (builder ticket; coordinator re-runs acceptance and scorecard).
FOLLOWUPS: Coordinator Lighthouse + SW offline acceptance on preview; install Playwright or use Chrome for full parity table; run `pnpm verify:comments` with `.dev.vars` auth secret; optional CSS inline A/B.

### Round 2 (coordinator acceptance) — 2026-11-04

Deploy: `pnpm deploy:preview` → `https://matchday-preview.jolyyjhon.workers.dev` (final version `14d7a77a-8a6c-4f9b-a8fc-9657d5951d40` without CSS inline; brief inline trial `1c5cbba6…` reverted).

**1. Lighthouse 12 mobile** (`npx -y lighthouse@12 --chrome-path=/usr/bin/google-chrome --form-factor=mobile --throttling-method=simulate`, median of 3):

| Page                                 | Perf | LCP (s) |      CLS | JS transfer (B) | Legacy ref                   |
| ------------------------------------ | ---: | ------: | -------: | --------------: | ---------------------------- |
| `/`                                  |   84 |    3.89 |    0.000 |          105316 | perf 92, LCP 3.39, CLS 0.000 |
| `/games/mlb-852989-new-york-yankees` |   84 |    3.91 | 0.000042 |           99325 | perf 96, LCP 2.85, CLS 0.000 |

Preview beats legacy on some runs (home perf 97 once) but medians are slightly slower on LCP than the September Next baseline; CLS matches.

**2. CSS inline experiment** (`inlineStyleThreshold: 120_000`, deploy `1c5cbba6…`, same Lighthouse on `/`):

| Variant                | Median LCP (s) | Median perf |
| ---------------------- | -------------: | ----------: |
| External CSS (kept)    |           3.89 |          84 |
| Inlined CSS (reverted) |           4.14 |          81 |

Inlined CSS **not kept**; preview redeployed without threshold.

**3. Service worker** (puppeteer-core + `/usr/bin/google-chrome`, script `/tmp/t13-puppeteer/sw-offline.mjs`):

- SW active on preview; offline reload shows board (`Next match…` / `.next-up` text present).
- With cookie `better-auth.session_token=x`, Cache Storage keys `['matchday-…']`; **HTML-ish entries: 0** (only immutable/JS/CSS assets listed).

**4. Parity** (puppeteer-core, main-region box max diff vs production, px):

| Route                                | 320 en |    320 es |     390 en | 390 es | 1280 en | 1280 es |
| ------------------------------------ | -----: | --------: | ---------: | -----: | ------: | ------: |
| `/`                                  |      0 | 25 (tabs) | 17 (cards) |     17 |       0 |       0 |
| `/?sport=baseball`                   |      0 |         0 |          0 |      0 |       0 |       0 |
| `/rules`                             |      0 |         0 |          0 |      0 |       0 |       0 |
| `/system`                            |      0 |         0 |          0 |      0 |       0 |       0 |
| `/games/mlb-852989-new-york-yankees` |     44 |        26 |         62 |     62 | **428** | **428** |
| `/sign-in`                           |     10 |        10 |         10 |     10 |      77 |      77 |

All samples HTTP 200/200, console errors 0/0. **Data-caused (not fixed):** game page card/scorebug stack height at 1280 (preview demo fixture / market panel content vs production); minor Spanish tab/card wrapping on `/` and sign-in card width at desktop. No port fixes applied in round 2.

**5. Comments verify:** gitignored `.dev.vars` (`BETTER_AUTH_SECRET`, dummy GitHub OAuth pair, `PUBLIC_SITE_URL=http://localhost:8780`); `wrangler dev --env preview --port 8780` (stopped PID 284954) → `pnpm verify:comments` → **COMMENTS SCENARIO OK**.

### Round 3 (LCP/FCP vs production) — 2026-11-04

Changes (`79db5db`, preview `1a230557-6db3-4e85-b8f5-5bc8a7cb9e1e`):

- `optimizePageHtml()` in `hooks.server.ts`: stylesheet before modulepreloads; `/` modulepreloads capped to 6 (entry start/app/payload, nodes 0+4, one runtime chunk). Was ~27 modulepreloads.
- `build.rolldownOptions.output.codeSplitting.minSize: 6000` to merge tiny chunks (`/` JS gzip 60573 B, still ≤ 61440).
- Early Hints + `<head>`: stadium **AVIF only**, with `media="(max-width: 1023px)"` / `(min-width: 1024px)` (no desktop WebP on phones).

**Lighthouse 12 mobile ×3** (same command on one machine: `npx -y lighthouse@12 --chrome-path=/usr/bin/google-chrome --chrome-flags='--headless=new --no-sandbox' --only-categories=performance --form-factor=mobile`), median:

| Site           | Perf | FCP (s) | LCP (s) | JS transfer (B) |
| -------------- | ---: | ------: | ------: | --------------: |
| Preview `/`    |   91 |    1.51 |    2.56 |          104181 |
| Production `/` |   93 |    0.95 |    3.20 |          262074 |

Round 2 preview (coordinator): FCP **2.47 s**, LCP **3.59 s**. Round 3 preview **LCP beats production** (2.56 < 3.20). **FCP** median **1.51 s** is still above production **0.95 s** (variance: one preview run hit FCP 1.10 / LCP 1.85). `pnpm check` → **CHECK OK 79db5db**.

## T15 prep — 2026-11-04 — coordinator

- **Production resources:** D1 `matchday-prod` `f2f0f349-6479-4155-a5c6-d9b79e27af6a`, KV `dee24d2bc7ae4ebb9169318918a5d0e9`, migrations 0000–0002 applied. App Worker `matchday` on custom domain `matchday.tendo.ar`, jobs Worker `matchday-jobs` with the three crons. Secrets set on both (new `BETTER_AUTH_SECRET` and `CRON_SECRET`; OAuth, OpenAI, Resend and provider keys from `.env.local`). `FOOTBALL_DATA_API_TOKEN` is still missing: Vercel marks it sensitive, so `vercel env pull` returns a placeholder.
- **Edge cache works on the custom domain:** second request to `/` and `/rules` is `cf-cache-status: HIT`, `x-mp-cache: HIT`.
- **Account is on Workers Free.** The cron deploy failed on the 5-cron account limit, so preview jobs now have `crons: []` and are triggered by hand.
- **Measured CPU on Workers Free (preview, tail):** warm SSR 1–15 ms, cold 50–80 ms, refresh 146 ms, settle 26 ms, enrich 9 ms. None were killed.
- **Blocker for Free:** after importing real data (142 games, 84 fixture contexts), `refreshAll` and `enrich` hang until the caller gives up (outcome `canceled`, no logs). The same refresh runs locally on the same data in 3.7 s. The likely cause is the Free limit of 50 D1 queries per invocation (Paid: 1000). The exception then hangs across the RPC, as in T03. Workers Paid is required.
- **Follow-up:** the app's cron routes should race `env.JOBS.*` against a timeout, so a jobs failure returns 504 instead of hanging.
- **Rehearsal on production D1:** `scripts/migrate/cutover.sh rehearse` printed export 2,356 rows, then `RECONCILE OK users=4 tables=20` (one oversized `provider_cache` row skipped, as documented).
- **Vercel redirect:** `scripts/migrate/vercel-redirect/` was tested as a protected preview deploy. `/`, `/rules` and `/games/x?y=1` all return 308 to `matchday.tendo.ar` with the path and query kept. The test deploy was removed.
- **Cutover:** `scripts/migrate/cutover.sh go` runs spec §7 steps 1–6 in order and stops on the first failed check.

## T15 cutover — 2026-11-04 — coordinator — DONE

- Oscar subscribed to Workers Paid. After that, refresh (52 s), enrich (135 s) and settle all pass on production with real data. This confirms the Free hang was the plan limit.
- OAuth: added `https://matchday.tendo.ar/api/auth/callback/{github,google}` to the existing GitHub app and Google client. The old callbacks were kept, and the secrets match.
- `scripts/migrate/cutover.sh go` ran: maintenance on (POST 503) → Vercel 308 → export 2,356 rows → transform → wipe → import → `RECONCILE OK users=4 tables=20` → maintenance off → refresh and enrich 200.
- Smoke test passed. The old URL returns 308 with path and query kept, pages return 200, signed-out users get 303 to sign-in, both sign-in providers return the new-domain `redirect_uri`, and an anonymous POST to `/api/bets` returns 401.
- `main` was fast-forwarded to `cf/main` and pushed. Vercel cancels `main` builds (ignoreCommand), so the redirect stays the production deployment.
- Lighthouse mobile on production, one run each:
  - `/`: score 89, FCP 1.99 s, LCP 3.41 s, TBT 3 ms, CLS 0, TTFB 67 ms (edge HIT), 342 KB.
  - Game page on a cold cache: score 85, FCP 2.62 s, LCP 3.83 s, TTFB 715 ms, 322 KB.
- First paint is still behind the old site's 0.95 s, so that's T13b.
- **Open:**
  - T13b: first-paint tuning.
  - Timeout around `env.JOBS.*` RPC calls.
  - `FOOTBALL_DATA_API_TOKEN` (soccer refresh is unconfigured).
  - After a stable week: delete `legacy/` and `scripts/verify/`, rewrite the docs, delete Neon after 30 days.

## T16 Publish once — 2026-11-04 — PASS (builder)

Branch / PR: cf/T16-publish-once / (not opened) Models: build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 8 code files plus this log. Pieces: 3
Ported from: none. Production refresh was putting the full KV read model after every team bundle (about 145 puts each, four teams in one `refreshAll`) and hitting "Too many API requests by single Worker invocation". Later D1 writes then failed as `persistence_error`.

What changed:

- `performSportRefresh` no longer calls `publishReadModels`. `refreshAllSports` publishes once after both sports, and only when `refreshed > 0`. `Jobs.refresh` (the `scheduleRefresh` RPC) does the same at its end. `publishReadModels` still logs failures and does not throw. `scheduleRefresh` is still fire-and-forget.
- One KV manifest, `publish:hashes:v1`: key to SHA-256 hex (first 16 chars) of the JSON string (`crypto.subtle`). Object keys are sorted before stringify so D1 row order is not a change; that string is what gets stored. The publish reads the manifest once, puts only `board:v1`, `game:v1:*`, and `routes:v1` when the hash differs, and writes the manifest, `publish:version`, and `publish:lastAt` only when at least one content key changed. The log is `publish_read_models` with `games`, `written`, `unchanged`, and `version`. The edge-cache key already includes the version, so an unchanged publish leaves it alone.
- `/api/cron/refresh` and `/api/cron/enrich` race `env.JOBS.*` against 280s; `/api/cron/settle` against 60s. Timeout is `apiFailure("timeout")` (504) and an `api_request` log with `errorCode: "timeout"`.

Deviations from the plan: none.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha; the gate below is `beb9eb6`, the commit before this log):

1. `pnpm check` → `CHECK OK beb9eb6`. Four files already on the branch failed `prettier --check` (one-line KV bindings and the Vercel redirect). This commit reflows them and does not change their behavior: `wrangler.jsonc`, `workers/jobs/wrangler.jsonc`, `scripts/migrate/vercel-redirect/public/index.html`, `scripts/migrate/vercel-redirect/vercel.json`.

2. Local jobs Worker only. No deploy, no remote D1 or KV. Migrations 0000–0002 applied with `wrangler d1 migrations apply DB --local --env preview --config workers/jobs/wrangler.jsonc --persist-to /tmp/t16-wrangler`. Dev server: `wrangler dev --config workers/jobs/wrangler.jsonc --env preview --test-scheduled --persist-to /tmp/t16-wrangler --port 8799`. Soccer skipped (`FOOTBALL_DATA_API_TOKEN` unset). Baseball refreshed Yankees and Red Sox from the public MLB stats API into that local D1.

Run 1, `GET /__scheduled?cron=5+*+*+*+*` → 200. Two teams persisted, one publish (not one per team):

```
{"timestamp":"2026-11-04T16:17:39.552Z","level":"info","event":"publish_read_models","games":10,"written":12,"unchanged":0,"version":"1"}
```

`written` 12 is the board, 10 game keys, and routes.

Run 2, same cron, still one publish. Stored snapshots include `freshness.fetchedAt` and `expiresAt`, so those keys really changed. The routes map is ids only and was left alone. Version moved because content changed:

```
{"timestamp":"2026-11-04T16:17:51.533Z","level":"info","event":"publish_read_models","games":10,"written":11,"unchanged":1,"version":"2"}
```

Same local D1, no further refresh. A scratch handler (not committed) called `publishReadModels` twice. Both logs are `written: 0` and the version stays `"2"`:

```
{"timestamp":"2026-11-04T16:18:42.762Z","level":"info","event":"publish_read_models","games":10,"written":0,"unchanged":12,"version":"2"}
{"timestamp":"2026-11-04T16:18:42.783Z","level":"info","event":"publish_read_models","games":10,"written":0,"unchanged":12,"version":"2"}
```

`wrangler kv key get publish:version --binding PUBLIC --local --env preview --persist-to /tmp/t16-wrangler` printed `2`. Stopped the listener from `ss -ltnp`: workerd pid 384144 on `127.0.0.1:8799`.

3. Timeout. Scratch `tsx` script, not committed. It imports the route's `withTimeout`, `JobsTimeoutError`, `logEvent`, and `apiFailure`, and races a never-resolving promise with 50ms in place of the 280s refresh limit. A promise that resolves still returns (`FAST_OK`). A rejected promise still rejects (`provider down`), not as a timeout.

```
{"timestamp":"2026-11-04T16:17:52.840Z","level":"error","event":"api_request","requestId":"63205996-c858-4435-9e1a-f3922626e162","route":"POST /api/cron/refresh","status":504,"code":"timeout","errorCode":"timeout","durationMs":50}
{"timestamp":"2026-11-04T16:17:52.841Z","level":"error","event":"api_request","requestId":"63205996-c858-4435-9e1a-f3922626e162","route":"POST /api/cron/refresh","status":504,"code":"timeout","durationMs":51}
STATUS 504
BODY {"error":{"code":"timeout","message":"The scheduled refresh request timed out.","requestId":"63205996-c858-4435-9e1a-f3922626e162"}}
ELAPSED_MS 64
```

The second `api_request` line is `apiFailure`, same as the existing `internal_error` path on these routes (the route logs `errorCode`, then `apiFailure` logs `code`).

Budgets touched: none. This check printed `/` 60573 bytes gzip (limit 61440) and `/games/[id]` 73030 (limit 81920). No UI change in this ticket.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: coordinator deploys after review. `FOOTBALL_DATA_API_TOKEN` is still unset, so soccer refresh stays unconfigured.

## T13b First paint — 2026-11-04 — PASS (builder)

Branch / PR: cf/T13b-first-paint / (not opened) Models: build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 14 (13 plus this log). Pieces: 4
Ported from: none. `legacy/` does not proxy crests; this ticket adds a same-origin cache because the hero crest was opening `crests.football-data.org` during first paint.
Deviations from legacy:

- Fonts are not preloaded. `font-display: swap` and the metric-matched fallbacks stay. Early Hints no longer list the three font files. `optimizePageHtml` drops any font preload that still appears and sets `fetchpriority="low"` on modulepreloads. The `/` cap of six modulepreloads is unchanged.
- Archivo is the same `@fontsource-variable/archivo@5.3.0` file, instanced to wght 600–800 and wdth 75–118 (the weights and widths in `app.css` / `matchup.css`: 600, 700, 800, and widths 75 condensed, 100, 112, 118). 90,104 → 54,056 bytes. `@font-face` now declares that range.
- IBM Plex Sans is `@fontsource-variable/ibm-plex-sans@5.3.0`, instanced to wght 400–700 (100–300 are unused). 45,712 → 33,464 bytes. DM Mono stayed the two static latin files (14,820 and 14,988). A glyph subset saved about 1 KB, so it was left as shipped.
- Regenerate with fonttools and brotli: `python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli && /tmp/ft/bin/python scripts/subset-fonts.py`. The script downloads those two fontsource 5.3.0 files and writes `static/fonts/`.
- Football-data crests render as `/crests/fd/<file>` (`src/routes/crests/fd/[file]/+server.ts`). The route allows `[A-Za-z0-9_-]+.(svg|png)` only, follows no redirects, rejects a non-image or anything over 512 KB, and caches for 30 days (`caches.default` and `cf.cacheEverything`). The hook skips the auth lookup for that path. Tracked clubs still use the bundled SVGs. MLB crests stay on `mlbstatic.com`.
- Inlining the stylesheet was measured and not kept. See below.
- `pnpm check` was already failing `prettier --check` on `wrangler.jsonc`, `workers/jobs/wrangler.jsonc`, and the two Vercel redirect files. Those four were formatted so the gate can pass. No binding values changed.
- Node is 24.20.0. `package.json` engines ask for 24.18.1. pnpm warns. The gate still passes.

Preview deploys (workers.dev, no edge cache, so TTFB is not the production number): before `1b66785c-43e9-4fdd-831e-b9f3b53f6d1d`, kept result `dc17885e-87f5-4e1a-a91b-dfadfabf2886` (redeployed as `3f68b709-990d-4fe8-97a2-bbff64620c8c` after the inline trial), inline trial `0f374cac-1e2c-4061-ba16-29c90f5a992f`. Game page: `/games/football-data-575386-real-madrid`.

Acceptance (`scripts/check-ok.mjs` prints the HEAD short sha; the gate below is `945a4c3`, before this log commit):

1. `pnpm check` → `CHECK OK 945a4c3`. `node scripts/budget.mjs` → `/ 60706` (limit 61440), `/games/[id] 73032` (limit 81920). No budget warning.

2. Lighthouse 12 mobile ×3, median, exact command `npx -y lighthouse@12 <url> --chrome-path=/usr/bin/google-chrome --chrome-flags='--headless=new --no-sandbox' --only-categories=performance --form-factor=mobile`. Simulated metrics. Old-site column is the ticket target. Preview before is this branch before the changes. Preview after is the kept deploy.

| Page | Metric      | Old site | Preview before | Preview after |
| ---- | ----------- | -------: | -------------: | ------------: |
| `/`  | Score       |       93 |             97 |           100 |
| `/`  | FCP         |   0.95 s |         1.52 s |        1.07 s |
| `/`  | LCP         |   3.20 s |         2.57 s |        1.61 s |
| `/`  | JS transfer |   262 KB |      105,261 B |     105,452 B |
| `/`  | Total bytes |   505 KB |      342,275 B |     294,402 B |
| `/`  | TTFB        |   307 ms |         516 ms |        174 ms |
| `/`  | CLS         |          |              0 |        0.0009 |
| game | Score       |       93 |             85 |            96 |
| game | FCP         |   0.95 s |         2.62 s |        1.13 s |
| game | LCP         |   3.20 s |         3.83 s |        2.75 s |
| game | JS transfer |   262 KB |       99,287 B |      99,252 B |
| game | Total bytes |   505 KB |      319,329 B |     270,932 B |
| game | TTFB        |   307 ms |         106 ms |        111 ms |
| game | CLS         |          |              0 |        0.0013 |

Home runs before: FCP 1.11 / 1.52 / 1.84, LCP 1.86 / 2.57 / 2.72. Home runs after: FCP 1.96 / 1.07 / 1.07, LCP 2.27 / 1.61 / 1.61. Game runs before: FCP 2.76 / 2.45 / 2.62, LCP 4.00 / 3.58 / 3.83. Game runs after: FCP 1.13 / 1.13 / 1.14, LCP 2.18 / 2.75 / 2.76.

Preview deltas: home FCP −0.45 s, home LCP −0.96 s, game FCP −1.49 s, game LCP −1.08 s. Score, JS transfer, and total bytes stay ahead of the old site. LCP on both preview pages is under the old site's 3.20 s. Simulated FCP is still above 0.95 s (home 1.07 s, game 1.13 s). Observed, unthrottled FCP on the kept home runs was 0.36–0.58 s. The coordinator remeasures production, where TTFB is the edge-cache number rather than this preview.

3. Inline CSS trial (`inlineStyleThreshold: 120_000`, disabled stylesheet link removed so it is not fetched twice). Not kept. Home median FCP 0.94 s (improved) and LCP 1.90 s (worse than 1.61 s). Game median FCP 0.99 s, LCP 2.71 s. The service worker still precached the CSS file (~18 KB) on top of the larger document (~24 KB). Round 2's finding stands once the fonts are out of the way: inlining does not improve FCP and LCP together.

4. Visual parity. Headless Chrome screenshots before the deploy and after the kept deploy, 390×844 and 1280×800, `/` and the game page. Pixel share with a luminance delta of 8 or more: home 390 0.04%, home 1280 0.01%, game 390 0.09%, game 1280 0.03%. The visible difference is the live countdown (`in 1h`, `Kickoff in`), not the subset faces or the crest. The AEK crest is `/crests/fd/1899.png` (6,622 byte PNG, second request `cf-cache-status: HIT`). `GET /crests/fd/..` and `GET /crests/fd/not-a-file` are 404.

Budgets touched: `/` first-load JS gzip 60,706 bytes (limit 61,440). `/games/[id]` 73,032 bytes (limit 81,920).
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Production Lighthouse after this deploys to the custom domain. Simulated preview FCP is still above 0.95 s; the kept change is the before/after delta above. Inlining the stylesheet gets home FCP to 0.94 s and raises home LCP, so it is not in the branch.

### Round 2

The coordinator asked for the inlined stylesheet to be kept, with no second CSS download, and for the script and hero-image options to be measured. Preview before is the round 1 build still on `matchday-preview` at the start of this round. Preview after is the kept build. Same Lighthouse 12 mobile command as round 1, three runs, median. Game page: `/games/football-data-575386-real-madrid`. No production deploy.

`inlineStyleThreshold: 200_000` (the file is 78,795 bytes raw, 15.72 KB gzip). The service worker's precache list drops paths ending in `.css`, so install does not fetch `0.*.css`. Early Hints are still only the two stadium images. There is no stylesheet in that `Link` header.

Removing the disabled `<link rel="stylesheet" disabled media="(max-width: 0)">` was measured and not kept. Vite's preload helper treats a `rel="stylesheet"` with that href as already loaded. Without the marker it injects a real stylesheet and waits for it. That run still transferred 18,417 bytes of CSS (home median FCP 0.96 s, LCP 1.61 s; game FCP 0.99 s, LCP 2.99 s). A local Chrome load of a disabled stylesheet with `media="(max-width: 0)"` did not request the file. With the marker left in place, Lighthouse stylesheet transfer is 0 on every kept run.

| Page | Metric       | Old site | Preview before | Preview after |
| ---- | ------------ | -------: | -------------: | ------------: |
| `/`  | Score        |       93 |            100 |           100 |
| `/`  | FCP          |   0.95 s |         1.08 s |        0.95 s |
| `/`  | LCP          |   3.20 s |         1.60 s |        1.52 s |
| `/`  | TBT          |          |           3 ms |          4 ms |
| `/`  | JS transfer  |   262 KB |      105,489 B |     104,461 B |
| `/`  | CSS transfer |          |       18,419 B |           0 B |
| `/`  | Total bytes  |   505 KB |      294,425 B |     291,373 B |
| `/`  | TTFB         |   307 ms |          79 ms |        142 ms |
| `/`  | CLS          |          |         0.0007 |        0.0009 |
| game | Score        |       93 |             97 |            98 |
| game | FCP          |   0.95 s |         1.10 s |        0.96 s |
| game | LCP          |   3.20 s |         2.60 s |        2.30 s |
| game | TBT          |          |           0 ms |          0 ms |
| game | JS transfer  |   262 KB |       99,313 B |      99,269 B |
| game | CSS transfer |          |       18,410 B |           0 B |
| game | Total bytes  |   505 KB |      270,980 B |     270,306 B |
| game | TTFB         |   307 ms |         113 ms |        415 ms |
| game | CLS          |          |         0.0014 |        0.0013 |

Home runs before: FCP 1.11 / 1.08 / 1.07, LCP 1.26 / 1.62 / 1.60. Home runs after: FCP 1.01 / 0.95 / 0.95, LCP 1.41 / 1.99 / 1.52. Game runs before: FCP 1.10 / 1.08 / 1.12, LCP 2.17 / 2.60 / 2.74. Game runs after: FCP 0.96 / 0.97 / 0.96, LCP 2.30 / 3.25 / 1.92. One game LCP run is 3.25 s. The median is 2.30 s. Observed, unthrottled FCP on the kept home runs was 378 / 219 / 171 ms (median 219). Game observed FCP was 499 / 153 / 700 ms.

The 0.90 s preview target was not met. Kept medians are 0.95 s and 0.96 s. Home matches the old site's 0.95 s and does not beat it. Game is 0.01 s above it. LCP stays under 3.20 s on the median. CLS stays at the same thousandths as round 1. TBT stays at a few milliseconds. There is no render-blocking request left. The critical chain is the document itself (about 23.6 KB on the wire, the inlined CSS included).

Options that were measured and not kept:

- Dropping every `modulepreload` on `/` and the game page. The entry script still loaded its imports. Home median FCP 0.97 s (worse than 0.95 s), LCP 1.46 s, TBT 8 ms. Game FCP 0.96 s, LCP 1.76 s, TBT 0 ms. FCP did not fall, so the low-priority hints stay. Game LCP was better without them. Both LCPs are under 3.20 s.
- Hero AVIF preload removed, on that no-modulepreload build. The 11 KB `night-stadium-800.avif` still downloaded, because it is the CSS background of `section.next-up`, and it started after the document finished. Home FCP 1.01 s, LCP 1.53 s. Game FCP 0.96 s, LCP 1.37 s. Home LCP and FCP were both worse than with the preload, so the preload stays.
- The 39 KB chunk is `MtBGoXOY.js` (101.32 KB, gzip 37.34 KB). The manifest calls it `navigation`. The file is the Svelte client runtime, and every route node imports it. `build.rolldownOptions.output.codeSplitting.minSize: 6000` does nothing: Vite warns that `minSize` without `groups` is ignored. Splitting the runtime would not take it off the hydration import graph. It was not split.

Kept preview version `801b6ad3-b464-4261-960f-f674f5c63bbc` (the measured document was `02a2d920-3487-4bd0-833f-f3309fe7d55f`, same HTML: one `<style>`, the disabled stylesheet link, six modulepreloads on `/`, stadium preload, no font preload). `pnpm check` → `CHECK OK 882a0e9`. Budgets unchanged: `/` 60,706 gzip (limit 61,440), `/games/[id]` 73,032 (limit 81,920).

Files this round: `vite.config.ts`, `src/service-worker.ts`, `src/lib/server/optimize-head.ts`, and this log.

### Round 3

The bootstrap now waits one frame and then a macrotask before `import()` / `kit.start`. `document.currentScript` is still read while the inline script runs, and the service-worker registration stays on `load`, outside that wait. Every `modulepreload` is dropped on HTML pages. The stadium image preload (head and Early Hints) stays. No production deploy. Preview before is the round 2 build, still live at the start of this round. Preview after is the kept build. Lighthouse 12 mobile, five runs, median of each metric. Game page: `/games/football-data-575386-real-madrid`. Queries `?r3=before` and `?r3=after` so the edge cache does not reuse the previous document.

| Page | Metric       | Old site | Preview before | Preview after |
| ---- | ------------ | -------: | -------------: | ------------: |
| `/`  | Score        |       93 |            100 |           100 |
| `/`  | FCP          |   0.95 s |         0.97 s |        0.97 s |
| `/`  | LCP          |   3.20 s |         1.82 s |        1.08 s |
| `/`  | TBT          |          |           4 ms |          3 ms |
| `/`  | JS transfer  |   262 KB |      105,427 B |      92,360 B |
| `/`  | CSS transfer |          |            0 B |           0 B |
| `/`  | Total bytes  |   505 KB |      293,786 B |     280,669 B |
| `/`  | TTFB         |   307 ms |          88 ms |         84 ms |
| `/`  | CLS          |          |         0.0009 |        0.0009 |
| game | Score        |       93 |             93 |           100 |
| game | FCP          |   0.95 s |         0.98 s |        0.96 s |
| game | LCP          |   3.20 s |         3.28 s |        1.53 s |
| game | TBT          |          |           0 ms |          0 ms |
| game | JS transfer  |   262 KB |       99,240 B |      97,892 B |
| game | CSS transfer |          |            0 B |           0 B |
| game | Total bytes  |   505 KB |      270,292 B |     268,597 B |
| game | TTFB         |   307 ms |         283 ms |         90 ms |
| game | CLS          |          |         0.0013 |        0.0013 |

Game LCP before this change was 1.74 / 3.28 / 3.28 / 3.33 / 2.02 s. Three of those runs are over 3.20 s, so the median is 3.28 s. Round 2's kept game LCP, the bar this round must not miss, is 2.30 s. The after median is 1.53 s.

Home runs before: FCP 1.02 / 0.98 / 0.95 / 0.97 / 0.95, LCP 1.19 / 1.61 / 2.65 / 1.82 / 1.90, TBT 2 / 4 / 4 / 7 / 4. Home runs after: FCP 0.96 / 0.95 / 0.97 / 0.97 / 0.97, LCP 1.37 / 0.95 / 1.08 / 1.08 / 2.52, TBT 5 / 3 / 3 / 4 / 3. Game runs before: FCP 0.97 / 0.99 / 0.98 / 0.98 / 0.99, LCP 1.74 / 3.28 / 3.28 / 3.33 / 2.02, TBT 0 / 0 / 16 / 2 / 0. Game runs after: FCP 0.97 / 0.96 / 0.96 / 0.94 / 0.96, LCP 0.97 / 1.53 / 1.39 / 1.89 / 1.97, TBT 0 on every run.

The 0.85 s preview FCP target was not met. Kept medians are 0.97 s and 0.96 s. Home FCP is unchanged from this round's before. Game FCP is 0.02 s lower. LCP is better than round 2 on both pages (1.08 s vs 1.52 s, 1.53 s vs 2.30 s). TBT is 3 ms and 0 ms. CLS is unchanged at 0.0009 and 0.0013. `start.*.js` still begins within about 3 ms of observed FCP (home observed medians around 162 ms, game around 166 ms), so Lantern's pessimistic graph still includes the script requests and the simulated FCP stays near 1.0 s.

Headless Chrome on the measured after build (`fc2dad75-2124-4036-9b30-3860b617080f`), with focus emulation and `prefers-reduced-motion: no-preference`:

- Hydration and client navigation. A click from `/` to the game page changed the URL with `performance.getEntriesByType('navigation')` still at 1. The app module loaded. No window errors.
- Service worker. `navigator.serviceWorker.getRegistration()` returned `https://matchday-preview.jolyyjhon.workers.dev/service-worker.js`. Registration is on `load`, outside the delayed import.
- View transitions. After a click, `document.startViewTransition` ran once. `prefers-reduced-motion: reduce` was false.
- Sign-in. `/sign-in` renders "Sign-in unavailable" and no forms, because this preview has no auth providers. No console errors. The provider forms are in the page when `data.providers` is non-empty.
- Preload. Navigation links use `data-sveltekit-preload-code="tap"` and `data-sveltekit-preload-data="tap"`, not hover. A mousedown fetched the route node, its chunks, and `__data.json`.
- Buddy. The launcher is hidden on `/` and on a game page. On `/rules`, clicking `.buddy-launcher` opened `dialog.buddy-panel`. No errors.
- Game query. `/games/football-data-575386-real-madrid?r3=query` kept the search string, showed h1 "PAE AEK vs Real Madrid CF", and hydrated with no errors.
- Spanish. `button[lang=es]` set `locale=es`, `aria-label` "Idioma", and `aria-pressed` true. No errors.

Measured and not kept:

- A double `requestAnimationFrame` instead of one frame plus `setTimeout(0)`. `start.*.js` still began within 1–2 ms of observed FCP. Home median FCP 0.97 s, LCP 1.45 s, TBT 5 ms. Game FCP 0.96 s, LCP 1.67 s, TBT 0 ms. FCP did not move, and home TBT was worse than round 2's 4 ms, so the macrotask wait is the one in the branch. Deploy `7a3e817f-d6b8-438a-ad08-58d9a06a3df8`.
- Stadium preload removed (head links and the Early Hints `Link` header), on the macrotask build. The 11 KB `night-stadium-800.avif` still downloaded, because it is the CSS background of `section.next-up`. Home median FCP 0.97 s, LCP 1.38 s, TBT 8 ms. Game FCP 0.96 s, LCP 1.97 s, TBT 0 ms. Both LCPs are worse than with the preload (1.08 s and 1.53 s), so the preload stays. Deploy `0c625204-ff36-4521-a81b-753f06c19705`.
- Trimming the inlined CSS was not clean, so it was not kept. The root layout imports `src/app.css` (71,225 bytes) and `src/lib/styles/matchup.css` (31,493 bytes) on every route. The built sheet is 78.79 KB raw. A cut limited to `/` and the game page would drop styles other routes render. Lighthouse `unused-css-rules` on the inlined sheet scored 1 with 0 items.

Kept preview version `9993027d-51a7-4563-b584-8f9d6d8eaa7d`. The ×5 after table was measured on `fc2dad75-2124-4036-9b30-3860b617080f`, the same HTML: the delayed import, no modulepreload, the disabled stylesheet link, the stadium preload, and Early Hints. `pnpm check` → `CHECK OK a297554`. Budgets unchanged: `/` 60,706 gzip (limit 61,440), `/games/[id]` 73,032 (limit 81,920).

Files this round: `src/lib/server/optimize-head.ts` and this log.

## T13c Fonts and beacon — 2026-11-04 — PASS (builder)

Branch / PR: cf/T13c-fonts-beacon / (not opened) Models: build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 4 (`src/app.css`, `src/hooks.server.ts`, `src/lib/server/optimize-head.ts`, this log). Pieces: 2
Ported from: none.
Deviations from the plan:

- The `fonts` class is not added inside the same macrotask as `kit.start`. That macrotask, and one extra frame after it, both still started the four woff2 requests a few milliseconds before observed FCP (160 vs 164, then 958 vs 964). The class now waits until a `first-contentful-paint` entry exists, with a 90-frame cap. On the kept build the requests start after that paint (home 870 vs 840, game 416 vs 372).
- `delayKitStart` only matched `./_app/...`, which is the root document. A game page imports `../_app/...`, so it never delayed `kit.start` and would never have gained the class. The pattern is now `(?:\.+\/)+_app/...`, which covers `./`, `../`, and `../../`.

No production deploy. Preview version `9ebb47bb-39fc-4350-a5be-b5f5916caf7a`. Game page: `/games/football-data-575386-real-madrid`. Queries `?t13c=before` and `?t13c=after`.

`document.fonts.check()` was measured in headless Chrome against a page that declares the four faces and does not use them. The check returned false for archivo 600, plexSans 400, and both DM Mono weights, and the server saw no woff2 request. A later document in the same profile, after archivo had been fetched, still returned false. The check does not itself start a load, so it stays: it adds `fonts` immediately only when this document has already loaded the faces. A warm HTTP cache is not that state.

HTML responses send `Cache-Control` with `no-transform`, `Vary: Accept-Encoding`, and `Content-Encoding: gzip` when the request accepts gzip. The body is `CompressionStream("gzip")` with `encodeBody: "manual"`. The edge cache stores the uncompressed render (`content-encoding` is dropped on `cache.put`) and compresses on the way out, including a HIT. `x-mp-cache` is still HIT, MISS, or BYPASS. `curl -H 'accept-encoding: gzip'` against preview: 20,938 bytes, magic `1f8b`, decompresses to a 105,475 byte document that starts with `<!doctype html>`. The earlier brotli document on the same preview was 21,610 bytes. A request with `accept-encoding: identity` is uncompressed HTML and still carries `no-transform`. A signed-in cookie is `x-mp-cache: BYPASS`, `private, no-cache, no-transform`, gzip. `/__data.json` is not given `no-transform`. Preview has no beacon; production removal is the coordinator's check.

Acceptance (`pnpm check` prints the HEAD short sha; the gate below is `03604be`, before this log commit):

1. `pnpm check` → `CHECK OK 03604be`. `node scripts/budget.mjs` → `/ 60705` (limit 61440), `/games/[id] 73031` (limit 81920). No budget warning.

2. Lighthouse 12 mobile ×5, median of each metric, same command as T13b. Simulated metrics except the observed-FCP row. Preview before is the T13b round 3 build that was live at the start. Preview after is `9ebb47bb-39fc-4350-a5be-b5f5916caf7a`.

| Page | Metric       | Old site | Preview before | Preview after |
| ---- | ------------ | -------: | -------------: | ------------: |
| `/`  | Score        |       93 |            100 |           100 |
| `/`  | FCP          |   0.95 s |         1.00 s |        0.96 s |
| `/`  | LCP          |   3.20 s |         1.37 s |        1.43 s |
| `/`  | TBT          |          |          38 ms |         40 ms |
| `/`  | JS transfer  |   262 KB |       90,972 B |      92,485 B |
| `/`  | CSS transfer |          |            0 B |           0 B |
| `/`  | Total bytes  |   505 KB |      279,259 B |     278,660 B |
| `/`  | TTFB         |   307 ms |         345 ms |         62 ms |
| `/`  | CLS          |          |         0.0009 |        0.0008 |
| `/`  | Observed FCP |          |         475 ms |        164 ms |
| game | Score        |       93 |            100 |           100 |
| game | FCP          |   0.95 s |         1.00 s |        0.94 s |
| game | LCP          |   3.20 s |         1.45 s |        1.40 s |
| game | TBT          |          |          24 ms |          0 ms |
| game | JS transfer  |   262 KB |       97,795 B |      99,268 B |
| game | CSS transfer |          |            0 B |           0 B |
| game | Total bytes  |   505 KB |      268,874 B |     268,331 B |
| game | TTFB         |   307 ms |         123 ms |         79 ms |
| game | CLS          |          |         0.0011 |        0.0009 |
| game | Observed FCP |          |         255 ms |        160 ms |

Home runs before: FCP 1.00 / 1.01 / 1.00 / 0.96 / 1.04, LCP 1.40 / 1.37 / 1.00 / 1.38 / 1.36, TBT 47 / 38 / 32 / 72 / 28. Home runs after: FCP 0.96 / 0.96 / 0.96 / 0.96 / 0.96, LCP 1.43 / 1.07 / 1.58 / 1.47 / 0.98, TBT 40 / 44 / 29 / 53 / 15. Game runs before: FCP 0.99 / 1.00 / 1.03 / 1.01 / 0.97, LCP 1.39 / 2.05 / 1.45 / 1.86 / 1.06, TBT 18 / 24 / 28 / 23 / 34. Game runs after: FCP 0.94 / 0.96 / 0.94 / 0.94 / 0.95, LCP 1.40 / 1.37 / 1.40 / 1.46 / 1.40, TBT 0 / 4 / 0 / 0 / 0.

The 0.88 s preview FCP target was not met. Kept medians are 0.96 s and 0.94 s. Home FCP is 0.04 s lower than this ticket's before. Game FCP is 0.06 s lower. Home LCP median is 1.43 s against 1.37 s before; the five runs overlap (before 1.00–1.40, after 0.98–1.58). Game LCP is 1.40 s against 1.45 s. Home TBT is 40 ms against 38 ms. Game TBT is 0 ms against 24 ms. CLS is 0.0008 and 0.0009 against 0.0009 and 0.0011. The four woff2 files still transfer about 119 KB, after first paint, so they stay in the total. Lighthouse still lists them as high-priority children of the document. Simulated FCP is still the document plus the script requests that begin at the same moment as first paint, which is the T13b round 3 residual.

3. Headless Chrome on the kept build, 390×844:

- Fonts. Before the class, computed `font-family` is `"plexSans Fallback", system-ui, sans-serif` and the text color is `rgb(244, 247, 251)` at opacity 1. After the class it is `plexSans, "plexSans Fallback", ...`. A team name is `archivo, "archivo Fallback", "Arial Narrow", sans-serif`. No sample had transparent or hidden text.
- Client navigation. A click from `/` to `/games/football-data-564741-real-madrid` left `performance.getEntriesByType('navigation')` at 1. Every frame through the click kept class `fonts` and the plexSans stack. The h1 became "Valencia CF vs Real Madrid CF".
- Spanish. `button[lang=es]` set `locale=es`, the group `aria-label` to "Idioma", `aria-pressed` true, and the nav label "Partidos". The class stayed. No exceptions.
- Signed-out game page. A fresh profile, no session cookie, on `/games/football-data-575386-real-madrid` rendered h1 "PAE AEK 2 – 3 Real Madrid CF, final" and then the webfont stacks. Font requests started at 416 ms, observed FCP at 372 ms.

4. Screenshots at 390×844, both after `document.fonts.ready`. Game page luminance delta of 8 or more: 0 of 329,160 px. Home: 17,064 px (5.18%). Of that, 15,712 px are y 702–767, where the before shot still had the product tour over the next row and the after shot shows Sunday's game. Above y 640 the delta is 1,352 px (0.54%), the Valencia crest, which had not painted in the before shot. The type and the hero card otherwise match.

Budgets touched: none. `/` first-load JS gzip 60,705 bytes (limit 61,440). `/games/[id]` 73,031 bytes (limit 81,920).
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Production check that `no-transform` plus this gzip removes the Cloudflare beacon and keeps the HTML compressed. Simulated preview FCP is 0.96 s and 0.94 s, still above 0.88 s.

## T13d Critical CSS — 2026-11-04 — PASS (builder)

Branch / PR: cf/T13d-critical-css / (not opened) Models: build Grok 4.7, verify not run
Builder scorecard: left for the coordinator
Files: 9 (`src/lib/server/critical-css.ts`, `src/lib/server/optimize-head.ts`, `src/hooks.server.ts`, `src/lib/components/full-css.ts`, `src/lib/components/navigation-provider.svelte`, `src/routes/+layout.svelte`, `src/service-worker.ts`, `vite.config.ts`, this log). Pieces: 4
Ported from: none. No new dependency. The pruner is a small parser over the Lightning CSS output.
Deviations from the plan:

- The full sheet is a `rel=preload` `as=style` link created in the after-first-paint callback. `load` switches it to `rel=stylesheet`. A stylesheet link with `media=print` was measured and replaced, because a request paused before its headers can still sit on the render path. The preload starts only after a first-contentful-paint entry exists. The disabled marker link stays, so Vite does not inject a second blocking stylesheet.
- The service worker still drops `.css` from its precache list. `cache.addAll` uses cache mode `reload`, and the worker registers on `load`, so precaching the file would download it again at install without helping first paint. The browser keeps the immutable response from the post-paint preload.
- Preview auth is not configured. `/sign-in` is the "Sign-in unavailable" page, and a selection cannot be armed, so there is no open signed-in slip. The upcoming game `/games/football-data-564741-real-madrid` renders the slip chrome (filters, selection placeholders, balance). The final used for Lighthouse does not.
- `x-mp-critical-ms` is `0.00` on every MISS. `performance.now()` and `Date.now()` both stay put through this synchronous turn on the Workers runtime. Local Node times are below.

No production deploy. Preview version `51c0251a-c55e-4ffe-a2bf-b78375b51563`. Game page: `/games/football-data-575386-real-madrid`. Queries `?t13d=before` and `?t13d=fonts`.

The inlined sheet on a home MISS is 26,802 B, down from the 78,993 B file. The game page, which has no wager panel while auth is off, inlines 25,254 B. `@font-face`, `:root`, `:root.fonts`, `@layer properties`, `@property`, and keyframes referenced by a kept rule stay. A selector is kept when it is not understood. `fonts` and `is-*` classes are treated as present, and a state suffix (`-active`, `-open`, `-selected`, `-current`) is kept when its base class is on the page. State attributes (`aria-*`, `data-*`, `open`, and the other boolean ones) pass. The product tour classes are always included. The bet-slip classes are included when `wager-panel` is in the document. If the pruned text is under 5% of the input, the original sheet is returned.

`curl -H 'accept-encoding: gzip'` against the kept preview, `wc -c`: home 11,994 B (before 20,932), game 11,305 B (before 20,346). Both are under 14,000 B. `x-mp-cache: MISS`, `x-mp-critical-ms: 0.00`.

Pruner CPU. On Node, a cold parse of the 78,993 B sheet against the home document is 7.33 ms and a warm index hit is 1.00 ms median (20 runs). The game's already-inlined sheet is 2.21 ms cold and 0.53 ms warm. The edge header cannot resolve a sub-millisecond synchronous turn, so it reports 0.00.

Acceptance (`pnpm check` prints the HEAD short sha; the gate below is `0cace71`, before this log commit):

1. `pnpm check` → `CHECK OK 0cace71`. `node scripts/budget.mjs` → `/ 60757` (limit 61440), `/games/[id] 73083` (limit 81920). No budget warning.

2. Lighthouse 12 mobile ×5, median of each metric, same command as T13c. Simulated metrics except the observed-FCP row. Document is the Worker gzip body (`curl | wc -c`), not the Lighthouse transfer size. Preview before is the build that was live at the start of this ticket. Preview after is `51c0251a-c55e-4ffe-a2bf-b78375b51563`.

| Page | Metric       | Old site | Preview before | Preview after |
| ---- | ------------ | -------: | -------------: | ------------: |
| `/`  | Score        |       93 |            100 |           100 |
| `/`  | FCP          |   0.95 s |         0.94 s |        0.80 s |
| `/`  | LCP          |   3.20 s |         1.52 s |        1.30 s |
| `/`  | TBT          |          |         2.5 ms |        5.5 ms |
| `/`  | JS transfer  |   262 KB |       92,424 B |      92,383 B |
| `/`  | CSS transfer |          |            0 B |      18,464 B |
| `/`  | Total bytes  |   505 KB |      278,599 B |     288,099 B |
| `/`  | TTFB         |   307 ms |         100 ms |         80 ms |
| `/`  | CLS          |          |         0.0008 |        0.0008 |
| `/`  | Observed FCP |          |         182 ms |        148 ms |
| `/`  | Document     |          |       20,932 B |      11,994 B |
| game | Score        |       93 |            100 |           100 |
| game | FCP          |   0.95 s |         0.94 s |        0.79 s |
| game | LCP          |   3.20 s |         1.37 s |        1.22 s |
| game | TBT          |          |           0 ms |          0 ms |
| game | JS transfer  |   262 KB |       97,821 B |      97,963 B |
| game | CSS transfer |          |            0 B |      18,427 B |
| game | Total bytes  |   505 KB |      266,886 B |     276,421 B |
| game | TTFB         |   307 ms |         105 ms |        122 ms |
| game | CLS          |          |         0.0009 |        0.0009 |
| game | Observed FCP |          |         175 ms |        221 ms |
| game | Document     |          |       20,346 B |      11,305 B |

Home runs before: FCP 0.94 / 0.95 / 0.94 / 0.95 / 0.94, LCP 1.59 / 1.37 / 1.44 / 1.52 / 1.52, TBT 2.5 / 2.5 / 2 / 2 / 2.5. Home runs after: FCP 0.84 / 0.79 / 0.80 / 0.79 / 0.80, LCP 0.95 / 1.29 / 1.30 / 1.38 / 1.46, TBT 4 / 5.5 / 5.5 / 6.5 / 4.5. Game runs before: FCP 0.94 / 0.94 / 0.94 / 0.94 / 0.94, LCP 1.37 / 1.43 / 1.37 / 1.66 / 1.37, TBT 0 / 0 / 0 / 0 / 0. Game runs after: FCP 0.79 / 0.79 / 0.78 / 0.79 / 0.78, LCP 1.22 / 1.22 / 0.92 / 1.30 / 0.78, TBT 0 / 0 / 0 / 0 / 0.

The 0.85 s preview FCP target is met on both pages (0.80 s and 0.79 s), down from 0.94 s. Home LCP is 1.30 s against 1.52 s before. Game LCP is 1.22 s against 1.37 s. Home TBT is 5.5 ms against 2.5 ms; the five runs are 4–6.5 ms and the score stays 100. Game TBT stays 0 ms. CLS stays 0.0008 and 0.0009. CSS transfer is the post-paint full sheet, about 18 KB, which is why the total is higher. It is a preload until `load`, so it is not in the render-blocking graph. Lighthouse document transfer is about 12,743 B home and 12,054 B game; the curl sizes above are the Worker body.

Webfonts were gated because home LCP still trailed T13b's 1.13 s. With the class still tied to first contentful paint, home LCP median was 1.37 s and game CLS median rose to 0.0016 on `.mp-side`. Moving `fonts` to the first `largest-contentful-paint` entry (with `load` as the fallback) brought home LCP to 1.30 s and game CLS back to 0.0009. On an unthrottled cold load the four woff2 requests started 34 ms after observed FCP (1,026 vs 992), so the swap is not late. CLS stays under 0.002. The gate is kept. Home LCP is still above 1.13 s.

3. Headless Chrome on the kept build:

- Screenshots at 390×844 and 1280×800, both after `document.fonts.ready`. Pairs: `/`, `/games/football-data-575386-real-madrid`, `/sign-in`, and `/` with `locale=es`. Luminance delta of 8 or more: 0 px on every pair. The Spanish mobile pair has 28 px of any difference, all under that threshold. Spanish `aria-pressed` was true and the nav label was "Partidos" at both widths.
- Client navigation with the CSS request paused in CDP. Observed FCP was 172 ms, and one stylesheet request was already paused before the click, so the preload did not start before first paint. While it stayed paused the URL remained `/`, the h1 remained "Upcoming games", and no navigation preview was mounted. After the request continued, the click landed on `/games/football-data-564741-real-madrid` with the webfont stack, the matchup header, and the slip chrome styled.
- The product tour is on the home screenshots, styled, including while the stylesheet request was held.

Budgets touched: `/` first-load JS gzip 60,757 bytes (limit 61,440), was 60,705. `/games/[id]` 73,083 bytes (limit 81,920), was 73,031. The layout chunk grew by the full-sheet wait.
Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: Home simulated LCP is 1.30 s, still above T13b's 1.13 s. The edge pruner header reads 0.00 because neither clock moves during the synchronous turn. A signed-in preview would be needed to open a real slip.

## T13c/T13d production check (Opus, 2026-11-04)

- T13c review fix: the client `start` import now waits on the same first-contentful-paint entry as the webfonts. With one frame plus a macrotask it still began 2–3 ms before observed FCP, and Lantern's pessimistic FCP graph counts High-priority scripts (images are not counted). Commit `1c24244`.
- T13d review fix: the LCP font gate falls back to `load`; if `load` had already fired (background tab, no LCP support) the class was never added. It now checks `document.readyState === "complete"`.
- Production after T13c: no `cloudflareinsights` beacon, HTML `content-encoding: gzip` about 20 KB, edge cache HIT intact. FCP 0.95 / 0.94 s, tied with the old site. The document was then the only request in the first-paint graph, at 21 KB gzipped (two slow-start round trips).
- Production after T13d (version `552de82e`), Lighthouse 12 mobile ×5 medians:

| Page     | Score |    FCP |    LCP | Speed Index |  TBT |    CLS |   TTFB |  Bytes | Document (gzip) |
| -------- | ----: | -----: | -----: | ----------: | ---: | -----: | -----: | -----: | --------------: |
| Old site |    93 | 0.95 s | 3.20 s |             |      |        | 307 ms | 505 KB |                 |
| `/`      |   100 | 0.79 s | 1.30 s |      0.99 s | 6 ms | 0.0007 |  95 ms | 281 KB |        11,987 B |
| game     |   100 | 0.79 s | 1.22 s |      0.94 s | 0 ms | 0.0016 |  79 ms | 271 KB |        13,386 B |

## M1 Motion foundation — 2026-11-04 — PASS (builder)

Branch: `motion/m1-foundation`. No PR. No production deploy. Models: build Grok 4.7, verify not run.
Files: 6 (`src/app.css`, `src/lib/components/motion.ts`, `DESIGN.md`, `docs/design/motion.md`, `AGENTS.md`, this log). Pieces: 5.
Ported from: none. No new dependency. Nothing imports `motion.ts`.

Deviations from the plan:

- `.group-tabs [role="tab"]` is not a flex row, so it did not gain `flex-direction: column`. The shared `::after` width reservation is on section tabs and group tabs. Section tabs are `inline-flex` and did gain the column alignment. A group tab will not reserve its bold label width until it is a column flex or grid. M4 should know that.
- Hover gating followed the listed rules. `.button-secondary:hover`, `.button-ghost:hover`, `.button-danger:hover` and `.selection-button:hover` were not in that list and stay as they were.
- The reduced-motion `details::details-content` shorthand lost to the more specific close duration. The reduce rule now also names `details:not([open])::details-content`, so a closed disclosure stays on opacity at 120 ms. That commit is `c97322f`, after the preview measurement. Neither measured document contains a `details` element, so the extra selector is not in those inlined sheets and the byte deltas below still stand.
- No CSS was cut. The document deltas are inside the allocation.
- FCP ≤ 0.82 s and TBT ≤ 10 ms miss on the base build and on this build, in the same session. The same-session deltas are inside the run spread. LCP, CLS, the LCP element, the shift culprits and non-composited animations pass.
- A second local Worker cannot start: the local D1 socket is already taken. The paused-stylesheet check is the after build only. Local pages are the demo board (`/games/mlb-nyy-01`), not the football-data id used for Lighthouse.
- No iOS or Android device. The row-gesture check is a CDP touch in desktop Chrome. No 25% playback recordings. The font and `start`-import gate (V4) was not re-measured; this ticket does not change that code.

Preview, one lock session. Before version `4b3de058-55f8-4e62-8d1d-101735c706e8` (cf/main `df77bd8`). After version `5f7ed27b-da6a-48ee-be2b-8a32d3c1b855`. Game page `/games/football-data-575386-real-madrid`. Queries `?m1=before` and `?m1=after`. Every body was `x-mp-cache: MISS`, `x-mp-critical-ms: 0.00`, `x-mp-version: 54`.

`curl -H 'accept-encoding: gzip' | wc -c`: home 12,233 B before, 12,372 B after (+139). Game 11,541 B before, 11,653 B after (+112). Both under 14,000 B. Home is inside +220 B and the game is inside +210 B.

Acceptance (`pnpm check` prints the HEAD short sha; the gate below is `c97322f`, before this log commit):

1. `pnpm check` → `CHECK OK c97322f`. `node scripts/budget.mjs` → `/ 60757` (limit 61440), `/games/[id] 73083` (limit 81920). Those are the cf/main figures. No budget warning.

2. Lighthouse 12 mobile ×5, median of each metric, same session. Simulated. Document is the Worker gzip body.

| Page | Metric   |   Before |    After | Gate                             |
| ---- | -------- | -------: | -------: | -------------------------------- |
| `/`  | Score    |      100 |      100 |                                  |
| `/`  | FCP      |  0.827 s |  0.832 s | ≤ 0.82 s, missed by the base too |
| `/`  | LCP      |  1.357 s |  1.368 s | ≤ base + 0.05 s, pass (+0.011)   |
| `/`  | CLS      |  0.00081 |  0.00078 | ≤ 0.002, pass                    |
| `/`  | TBT      |    71 ms |  56.5 ms | ≤ 10 ms, missed by the base too  |
| `/`  | Document | 12,233 B | 12,372 B | ≤ 14,000 and ≤ +220, pass        |
| game | Score    |      100 |      100 |                                  |
| game | FCP      |  0.829 s |  0.833 s | ≤ 0.82 s, missed by the base too |
| game | LCP      |  1.281 s |  1.207 s | ≤ base + 0.05 s, pass            |
| game | CLS      |  0.00088 |  0.00105 | ≤ 0.002, pass                    |
| game | TBT      |  25.5 ms |  33.5 ms | ≤ 10 ms, missed by the base too  |
| game | Document | 11,541 B | 11,653 B | ≤ 14,000 and ≤ +210, pass        |

Home FCP runs after, ms: 844.954, 831.735, 816.239, 865.53, 808.463. Before: 857.477, 846.834, 827.267, 803.666, 819.351. Game FCP after: 806.423, 833.024, 832.661, 788.962, 844.534. Before: 823.519, 838.333, 829.08, 831.398, 800.301. Home TBT before 63.5–85 ms, after 47–81.5 ms. Game TBT before 16–31.5 ms, after 18–67.5 ms. `non-composited-animations` has 0 items on every run. LCP node stays `section.next-up` on `/` and `header.mp-bug` on the game. Shift culprits stay the next-up header and the slate timezone on `/`, and `.mp-side` (plus a side name or the kickoff time) on the game.

3. Tour copy, plexSans, fresh profile. Line counts: 360 en 2/2/2, 360 es 2/2/2, 390 en 2/2/1, 390 es 2/2/2. English step 3 at 390 is one line (21.39 px against a 20.4 px line). `.tour-bar-copy` has `min-height: 2lh`. The bar was already 65.78 px tall, button-driven, on the one-line step.

4. Local Chrome on `npx wrangler dev --env preview --port 8701`, 390×844 unless noted.

- Forced `:active` after 200 ms: `a.button` and `.slate-chip` are `matrix(0.97, 0, 0, 0.97, 0, 0)` with a 120 ms transition. `.game-row` stays `transform: none`, `transition-duration: 0s`, and `background-color` `#14212d` (`--slat-raised`) with the gradient gone.
- A touch drag that starts on a game row leaves `offsetTop` at 579 and `transform: none`.
- Disclosure `::details-content`, no preference. Closed computed duration is `0.2s, 0.15s, 0.2s` on block-size, opacity, content-visibility. Open height at 20 ms steps: 0, 23, 42, 56, 71, 75, 78, 80 px. Close: 80, 53, 32, 18, 5, 2.7, 0.6, 0.2, 0 px. The close reaches rest sooner.
- Frames during that disclosure. 1×: 23 frames, 0 over 34 ms, max 17 ms. 4×: 19 frames, 2 over 34 ms, max 217 ms as the throttle engaged on the block-size transition. 6× close: 37 frames, 0 over 34 ms, max 17 ms.
- Reduced motion. Pressed button transform is `none`. Opening the disclosure snaps block-size to 80 px on the first sample and stays there. Closing snaps to 0 px. The computed transition is then `opacity` at `0.12s`.
- Desktop 1280: `.mobile-nav` is `display: none` and `0×0`. The 1024 px hide is unchanged.
- Fine pointer at 1280: a hovered game row keeps `linear-gradient(135deg, …)` across five samples, duration `0s`. No interpolated dark dip.
- A synthetic `.section-tabs` bar with `data-label`. Tab x positions 12, 98, 182 stay put when the middle label changes from "Settled" to "Done".
- Tour entry at 390. Nav is `position: relative`, z-index 40, y 768, height 76. The bar comes to rest at y 702.22, height 65.78, bottom on the nav top. `elementFromPoint` across the nav never hit `.tour-bar` (`tour-covers-nav: false`).
- A `.banner-static` warning spliced into the inlined sheet paints at opacity 1 with no transform and no animation. The ordinary banner next to it paints at opacity 0 and `translateY(-4px)`.
- Stylesheet paused on the demo home: first paint is true, `getAnimations()` is empty, and the `section.next-up` box matches the settled frame (x 12, y 85, w 366, h 298.625). A luminance spike on the first pair was the away crest still decoding, not a fade.
- The five client hooks (`tour-bar-leaving`, `buddy-panel-live`, `buddy-launcher-enter`, `buddy-launcher-slot`, `locale-pending`) are absent from the preview game's inlined sheet. `::view-transition` and `2lh` are present. `details:not([open])` is absent, which matches a document with no `details`.

Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: FCP and TBT miss the absolute caps on the unchanged base in this session, so they are not a reason to cut the motion CSS. Group tabs still need a column flex or grid before `data-label` can reserve width. No phone, and no 25% recordings.

## M2 Shell and navigation — 2026-11-05 — PASS (builder)

Branch: `motion/m2-shell`. No PR. No production deploy. Models: build Grok 4.7, verify not run.
Files: 11 (10 source files plus this log). Pieces: 10. No new dependency. No CSS edited.
`motion.ts` is imported only by `account-control.svelte` and `buddy.svelte`, both lazy. `+layout.svelte`, `shell-content.svelte`, `tour-bar.svelte`, `account-control-lazy.svelte` and `language.svelte.ts` use literal milliseconds. `interaction-hooks.ts` is a dynamic import from `onMount` (built chunk `Mdir36ZT.js`); it is not in the document's scripts and not on the `/` first-load graph.

CSS for the coordinator: none.

Deviations from the plan:

- The home silhouette uses the live hero's classes, a transparent wrapping "New York Yankees", the freshness row and the timezone line. A fixed bar cannot match a two-line phone name and a one-line desktop name at once. The static `.breadcrumb` in the heading is there because the real breadcrumb paints one copy in the heading. A short team name on a phone would leave the hero about one line tall. The first panel is three 76 px bars, so its height is taller than a two-row board; the top edge matches.
- `fade()`'s duration parameter is inferred as the literal `150`. The balance call casts `DURATION.enter` at the call site. `motion.ts` was not edited.
- `motion/m1-foundation` is checked out in another worktree, so the base was deployed from a detached worktree of `38c4457`, under the same lock, then this branch was deployed. Nothing in the M1 worktree was edited.
- Local auth is unconfigured. The chip, the balance settle, `data-account` on a signed-in first frame, and signed-in You / Groups / group-detail parity were not exercised in a session. The chip import still waits on `fullCssReady()`.
- No iOS device, so `hasUAVisualTransition` was not observed. No fallback was added. No phone, and no 25% recordings.

Preview, one lock session. Before version `e0c66345-294c-4efc-a0a3-d494b0fde923` (`38c4457`). After version `053a39ba-6e59-4e41-8dc0-ad375f1a59c0` (`1985c0f`). Game page `/games/football-data-575386-real-madrid`. Queries `?m2=before` and `?m2=after`. Every body was `x-mp-cache: MISS`, `x-mp-critical-ms: 0.00`, `x-mp-version: 56`. The signed-out HTML differs only by the kit hash, the app chunk hash and `requestTime`.

`curl -H 'accept-encoding: gzip' | wc -c`: home 12,355 B before, 12,357 B after (+2). Game 11,635 B before, 11,637 B after (+2). Both under 14,000 B and inside +10 B.

Acceptance (`pnpm check` prints the HEAD short sha; the gate below is `1985c0f`, before this log commit):

1. `pnpm check` → `CHECK OK 1985c0f`. `node scripts/budget.mjs` → `/ 61116` (M1 60757, +359, limit +400) and `/games/[id] 73445` (M1 73083, +362, limit +400). No budget warning. `/` headroom left is 324 B of the 683 B shared with M4.

2. Lighthouse 12 mobile ×5, median of each metric, same session. Simulated. Document is the Worker gzip body.

| Page | Metric   |   Before |    After | Gate                     |
| ---- | -------- | -------: | -------: | ------------------------ |
| `/`  | Score    |      100 |      100 |                          |
| `/`  | FCP      |  0.790 s |  0.794 s | ≤ 0.82 s, pass           |
| `/`  | LCP      |  1.363 s |  1.354 s | ≤ base + 0.05 s, pass    |
| `/`  | CLS      |  0.00076 |  0.00075 | ≤ 0.002, pass            |
| `/`  | TBT      |     5 ms |     7 ms | ≤ 10 ms, pass            |
| `/`  | Document | 12,355 B | 12,357 B | ≤ 14,000 and ≤ +10, pass |
| game | Score    |      100 |      100 |                          |
| game | FCP      |  0.793 s |  0.787 s | ≤ 0.82 s, pass           |
| game | LCP      |  1.285 s |  1.215 s | ≤ base + 0.05 s, pass    |
| game | CLS      |  0.00090 |  0.00090 | ≤ 0.002, pass            |
| game | TBT      |     0 ms |     0 ms | ≤ 10 ms, pass            |
| game | Document | 11,635 B | 11,637 B | ≤ 14,000 and ≤ +10, pass |

Home FCP runs after, ms: 793.744, 794.029, 789.46, 786.272, 795.172. Before: 788.608, 789.586, 800.228, 798.373, 786.491. Game FCP after: 790.34, 790.328, 785.58, 787.401, 786.469. Before: 796.938, 792.788, 791.783, 783.008, 795.938. Home TBT before 5–10 ms, after 5–45.5 ms (median 7). Game TBT before 0–21 ms, after 0–3.5 ms. `non-composited-animations` has 0 items on every run. No `NO_LCP`. LCP node stays `section.next-up` on `/` and `header.mp-bug` on the game. Shift culprits stay the next-up header and the slate timezone on `/`, and `.mp-side` (plus a side name or the kickoff time) on the game.

3. Local Chrome on `npx wrangler dev --env preview --port 8702`.

- Paint gate, unthrottled home. FCP at 68 ms. The full sheet and `entry/start.js` start at 92 ms and 93 ms. `interaction-hooks` is not a document script. This headless Chrome did not expose `largest-contentful-paint` entries. The five client hooks are absent from the preview HTML; `data-account` and `navigation-preview` are the M1 selectors and are in both documents.
- Stylesheet paused at 390. First paint has `section.next-up` at x 12, y 85, w 366, h 298.625, the same box as the settled frame. `getAnimations()` held one nameless animation while the request was paused and none after it was released. No account chip and no Sign in, because auth is unconfigured.
- Show-delay, fetch held 2 s. The mobile-nav indicator moved at 5 ms. `.navigation-preview` appeared at 103 ms. The main was never blank. The route was hidden only once the preview was up, and the launcher slot was `inert`. A cached board-to-game navigation finished with no preview frame.
- Preview against the settled page, landmarks within 0 px. Home at 390: next-up y 12 h 298.63, filters y 359.42, first panel y 458.42. Home at 1280: next-up y 28 h 285.52, first panel y 461.31. Unconfigured `/you` and `/groups` at 1280 match the heading and the first panel edge. At 390 the heading is 0 tall, the title is 1×1, and the panel edge is y 12. Group detail was not measured.
- Frames over a 600 ms home-to-you navigation. 1×: 37 frames, 0 over 34 ms, max 33 ms. 4×: 34 frames, 1 over 34 ms, max 67 ms. 6×: 29 frames, 1 over 34 ms, max 150 ms. The long frame is the route commit.
- Behaviour. A second click of the current tab adds 0 `startViewTransition` calls. One crossfade runs for a real navigation. Under reduced motion the count stays 0 and `.navigation-preview` computes `animation-name: none`. A hit-test 60 ms into the crossfade returns the new document (`HTML`), on the new path. Board-to-game keeps `.tour-bar`. Groups-to-you keeps `.buddy-launcher`. The tour unmounts only when the shell leaves home and games. Skip sets `tour-bar-leaving` immediately, opacity and translate run, and the bar is gone between 183 ms and 216 ms. Escape sets `data-closing`, the dialog is gone after the exit, and a second synthetic cancel throws nothing. "Opening Buddy…" is absent at 80 ms when the chunk is cached. The forget control is a `.label-swap` whose hidden label is "Forgotten". Choosing Español adds `locale-pending` and the class is gone after the refresh. The balance fade was not run: the chip does not mount when auth is unconfigured.
- Reduced motion on the open sheet: transition 0.12 s, property opacity and colours, transform `none`. Closing opacity is mid-fade at 30 ms with transform `none`.

Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: no iOS device and no signed-in session, so the chip fade, the balance settle and `hasUAVisualTransition` are unmeasured. No 25% recordings. A short opponent name on a phone will not match the two-line silhouette.

## M3 Game slip, tabs and replies — 2026-11-05 — PASS (builder)

Branch: `motion/m3-game`. No PR. No production deploy. Models: build Grok 4.7, verify not run.
Files: 8 (the seven below plus this log). Pieces: 7 (discussion hold, market arrival, bet bar, confirmation, in-bar feedback, tabs, replies).
Ported from: none. No new dependency. No `svelte/transition`, `animate`, `motion` or `easing` import. No CSS for the coordinator. `src/app.css` is untouched.

Implementation is `d404776`. `discussion-panel.svelte` holds the discussion promise and calls `arrive` on the first resolve. The slip, the market filters, the bar, the confirmation and the error banner animate after paint from `bet-slip.svelte` and `matchup.css`. Tab changes from a pointer fade the panel; arrow keys and Enter/Space do not. Reply disclosure uses the client-only `.discussion-replies` block-size transition. `class="bet-slip"` is only on the real slip section.

Deviations from the plan:

- `/` first-load JS is 60,758 B gzip against M1's 60,757 B. The extra byte is `match-chrome.svelte` (`data-label` and the pointer/keyboard argument), which the home layout loads through the navigation preview. The 61,440 B limit holds and `budget.mjs` prints no warning. `/games/[id]` is 73,809 B, +726 B against M1's 73,083 B, inside +1,000 B and under 81,920 B.
- The home document shrank by 19 B. Finished grew by 67 B and upcoming by 68 B. Both game documents stay under 14,000 B and inside +90 B. Nothing was cut.
- Upcoming TBT on the M1 build in this session is 22 ms, over the 10 ms cap (runs 3, 22, 33, 33, 5.5). The same page after this branch is 0.5 ms. Finished TBT is 0 ms against a 5 ms base. Both are inside the run spread of the base, so this is not a reason to cut the motion CSS.
- Upcoming LCP on the M1 build has one 2.337 s sample, so that median is 1.366 s. After is 1.216 s.
- The paused-stylesheet baseball scorebug was 23 px taller on the first frame than after the sheet and fonts settled (274.45 vs 251.22). x, y and width matched, opacity was 1, and `getAnimations()` was empty. The soccer scorebug matched exactly. The baseball delta is the fallback font wrapping the long names while the sheet is paused.
- No paint-flashing trace. The bar and the confirmation animate `transform` and `opacity` only. The 25% replies recording is 4 frames; the other 25% and 1× recordings are listed below. No phone and no iOS.

Preview, one lock session. Before version `e573a548-2795-4154-80aa-8d590356783c` (M1 worktree). After version `ecbe2b5e-9c77-427c-b7cc-2d26ff78e6d9`. Finished game `/games/football-data-575386-real-madrid`. Upcoming game `/games/football-data-564741-real-madrid` (still scheduled 2026-11-07). Queries `?m3=before` and `?m3=after`. Every body was `x-mp-cache: MISS`, `x-mp-critical-ms: 0.00`, `x-mp-version: 56`.

`curl -H 'accept-encoding: gzip' | wc -c`: home 12,371 B before, 12,352 B after (−19). Finished 11,653 B before, 11,720 B after (+67). Upcoming 11,252 B before, 11,320 B after (+68).

Acceptance (`pnpm check` prints the HEAD short sha; the gate below is `d404776`, before this log commit):

1. `pnpm check` → `CHECK OK d404776`. `node scripts/budget.mjs` → `/ 60758` (limit 61440), `/games/[id] 73809` (limit 81920). No budget warning. The pre-existing `state_referenced_locally` warnings in buddy, join-link and notify-toggle are still the only typecheck warnings.

2. Lighthouse 12 mobile ×5, median of each metric, same session. Simulated. Chrome `/usr/bin/google-chrome`, headless. Document is the Worker gzip body. The four runs opened (finished 4 before and after, upcoming 5 before, upcoming 3 after) each scored 100.

| Page     | Metric   |   Before |    After | Gate                                   |
| -------- | -------- | -------: | -------: | -------------------------------------- |
| finished | FCP      |  0.792 s |  0.793 s | ≤ 0.82 s, pass                         |
| finished | LCP      |  1.213 s |  1.219 s | ≤ base + 0.05 s, pass (+0.007)         |
| finished | CLS      |  0.00090 |  0.00090 | ≤ 0.002, pass                          |
| finished | TBT      |     5 ms |     0 ms | ≤ 10 ms, pass                          |
| finished | Document | 11,653 B | 11,720 B | ≤ 14,000 and ≤ +90, pass               |
| upcoming | FCP      |  0.790 s |  0.786 s | ≤ 0.82 s, pass                         |
| upcoming | LCP      |  1.366 s |  1.216 s | ≤ base + 0.05 s, pass                  |
| upcoming | CLS      |  0.00126 |  0.00126 | ≤ 0.002, pass                          |
| upcoming | TBT      |    22 ms |   0.5 ms | ≤ 10 ms; the base misses, after passes |
| upcoming | Document | 11,252 B | 11,320 B | ≤ 14,000 and ≤ +90, pass               |

Finished FCP after, ms: 809.060, 786.625, 787.882, 792.634, 793.065. Before: 828.043, 819.001, 792.369, 792.307, 786.351. Finished LCP after: 1224.120, 1219.250, 1215.764, 1213.268, 1222.130. Before: 945.043, 1216.002, 908.738, 1212.614, 1216.702. Finished TBT after: 0, 0, 1, 2.5, 0. Before: 9.5, 9.5, 4.5, 3, 5. Upcoming FCP after: 782.145, 786.497, 796.893, 785.815, 799.593. Before: 788.226, 786.771, 795.489, 816.050, 790.281. Upcoming LCP after: 914.290, 1216.994, 1209.786, 1215.630, 1225.186. Before: 2337.452, 1365.542, 1230.978, 1368.100, 1216.562. Upcoming TBT after: 2.5, 0.5, 0, 0, 4.5. Before: 3, 22, 33, 33, 5.5. `non-composited-animations` has 0 items on every run. No NO_LCP. LCP node stays `header.mp-bug`. Shift culprits stay `.mp-side` plus a side name, the kickoff `<time>`, or `.mp-clock-figure`.

The finished-game filmstrip frame at 1.125 s is the settled scorebug on both builds: PAE AEK 2–3 Real Madrid CF, FULL TIME, Overview selected. LCP is that `.mp-bug`.

3. Local Chrome on `npx wrangler dev --env preview --port 8703`, 390×844, signed in on `/games/mlb-nyy-01` unless noted. `soc-rma-01` is the second game page. Both seed games are scheduled. The preview finished fixture is the Lighthouse target above.

- SSR `curl` of both local game pages: no element carries `bet-slip`, and there is no `.bet-bar` element. The inline style has neither `bet-slip` nor `bet-bar-leaving`. The string `bet-bar` appears only as the pre-existing inlined `.bet-bar` rule, because the skeleton's `wager-panel` class keeps that block.
- Stylesheet paused. Opacity 1, `getAnimations()` empty, client hooks absent. Soccer `.mp-bug` box matches the settled frame (height 258.09). Tab boxes stay within 4 px of the full sheet. Tab x positions are `[2, 114, 202, 305]` before and after a selection change. The indicator crossfades: at 40 ms the leaving `::after` is 0.18 and the entering one is 0.82.
- A pointer tab switch leaves `mp-fade` on the panel only. ArrowRight and a `detail` 0 click leave `getAnimations()` empty on the panel. Discussion and slip are unmounted with the overview panel, so they have no animation of their own.
- Discussion mounts on the first resolve. Replies open to about 161 px, opacity 1, `overflow: clip`. Close samples: 161, 107, 36, 11, 5.5, 1.2, 0.1, 0. A vote, a post, and a simulated 60 s refresh (`Date.now` + 61 s, then `visibilitychange`) remove 0 nodes. The thread stays connected and `aria-expanded` stays true. Focus inside the open replies is not clipped (outline 3 px), so `overflow-clip-margin` was left off.
- Bar dock after `.bet-slip` mounts, translateY: 260, 214, 83, 46, 19, 8, 3, 0.8, then `none` at opacity 1. Switching prices leaves `transform: none` across six samples. `.workspace-scroll` `scrollTop` stays 0 through arm and place. 1× frame sampler during arm: 102 frames, 0 over 34 ms, max 17 ms.
- Two failed places keep the banner text "The price moved. Check it and try again." The banner's `getAnimations()` replays and `.bet-bar` count stays 1. A successful place focuses `.bet-confirmation` ("Placed 1 on Away → returns 2. New balance: 999. Done") with `scrollTop` 0.
- Done, then re-arm the same price inside the exit: `bet-bar-leaving` is set, transform y is about 203 and opacity about 0.22, then the class clears, the confirmation unmounts, and the bar reverses (y about 31 and falling). The two POSTs both send `selectionId: "away"`, price 1.95, stake 1, with idempotency keys `bedee2e3-735d-4e92-9d22-f259e85a814b` and `ed4b2a44-d085-4fbe-9208-98971d82a1a3`. Each key inserted a new wager row.
- Filter "Runs": 3 visible markets, all three carrying `mp-fade` at 40 ms.
- `?pick=baseball-moneyline:home`: `.mp-bug` y stays 148.1875 before and after the bar mounts.
- CPU 4× during the signed-in upcoming flow: 43 frames, 0 over 34 ms, max 17 ms, no long-animation frames. CPU 6×: 42 frames, 0 over 34 ms, max 33 ms, no long frames.
- Reduced motion. Bar entry is `transform: none`, opacity 0 then 1, transition-duration 0.12 s, transition-property opacity and colors. A `.bet-bar-leaving` probe is `transform: none`, opacity 0, duration 0.12 s. Replies transition-property has no block-size.
- Recordings at `/tmp/m3-shots`: `arm-1x`, `place-1x`, `done-rearm-1x`, `tabs-1x`, `filter-1x`, `replies-1x`, `arm-25`, `filter-25`, `tabs-25`, `replies-25`.

Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: none for the coordinator. `/` JS is one gzip byte over the M1 figure because the tab chrome is shared with the home layout. No phone.

## M4 Home slate, /you and groups motion — 2026-11-05 — finished by Codex

Branch: `motion/m4-home-groups`, based on `motion/m1-foundation` (`38c4457`). Completed the implementation left in `574bc30`; fixes in `a802ebd` and `59b7407`. No PR, production deploy, dependency change, or CSS-file edit. Performance exceptions are recorded below; this entry supersedes the builder's incomplete PASS.

Implementation and review:

- Home chips keep their selection locally, set the cookie and replace the URL without fetching. The initial value comes from the already validated server load (URL, then cookie, then all), avoiding duplicated client parsing. A microtask follows Svelte's queued DOM flush. Board fades cancel earlier animations; empty panels, the hero frame, crests and CTA stay still. The permitted hero-text fade fallback remains omitted.
- Simplified fixture filtering, date parsing and prefetch bookkeeping to recover the byte budget. Prefetch still selects at most four fixtures, live first and then upcoming. Slate imports no motion helper, statically or dynamically.
- Client response banners now actually receive the existing `enter` hook. Identical errors replay via their attempt keys; errors remain visible during retries. A failed invitation clears the previous success message when its response settles.
- Copy resets before each successful copy, restarts its two-second timer and clears it on destruction. An unavailable clipboard no longer falsely reports success. Notification labels remain visible and accessible while saving.
- History keeps its last list while navigation and its replacement promise are pending; an obsolete promise can no longer clear a newer request's busy state. Background refresh does not dim it.
- Reset dialog entry/exit uses the existing tokens. Its client-only inline token values cap the inherited backdrop fades at 120 ms under reduced motion, including preference changes while open. This fixes M1's `*::before`/`*::after` rule missing `::backdrop`, without editing CSS.
- No transition-library imports, SSR entry hooks, money animation, logic waiting for animation, or new dependency. Pointer tabs fade; keyboard panel changes stay instant. Existing M1 colour transitions still run on the selected tab.

Acceptance evidence:

1. **V1:** `pnpm check` printed `CHECK OK`; no BUDGET WARN. Clean M1 first-load gzip: `/` **60,757 B**, game **73,083 B**. Final M4: `/` **60,902 B (+145 B, passes +150 B cap)**; game **73,149 B (+66 B)**. The home route chunk itself is 5,078 B versus 5,000 B; the remaining +67 B comes from shared/runtime chunks and changed import hashes. The original M4 home result was 61,039 B (+282 B). The game source is unchanged, but its literal byte-equality gate misses because of the shared chunk changes.

2. **V2 / V3:** One complete `flock /home/oscar/Projects/plan-bet-wt/locks/preview.lock bash /tmp/m4-codex-pair.sh` session: clean checkout `/tmp/m4-codex-base` at M1, `pnpm deploy:preview`, five Lighthouse 12 mobile runs on each page, M4 `pnpm deploy:preview`, then five runs on each page. Query variants were `?m4=before` and `?m4=after`. Base version `3a5f081a-e399-4daa-a340-04b815dfb71c`; M4 version `ecc75a23-baa8-4543-ba86-e470f2c11aa3`. An initial attempt failed before deployment because pnpm rejected a symlinked dependency directory; the complete session used a clean, independently installed checkout.

   | Page / variant     |     FCP |     LCP |     CLS |     TBT |
   | ------------------ | ------: | ------: | ------: | ------: |
   | Home / M1          | 0.797 s | 1.096 s | 0.00082 |  6.5 ms |
   | Home / M4          | 0.803 s | 1.100 s | 0.00086 | 14.0 ms |
   | Finished game / M1 | 0.799 s | 0.948 s | 0.00130 |  6.5 ms |
   | Finished game / M4 | 0.799 s | 0.948 s | 0.00130 |  3.0 ms |

   These are five-run medians, not the previous builder's same-build comparison. All 20 runs had zero non-composited-animation items, no runtime/NO_LCP error, and the expected LCP node (`SECTION.next-up` at home, `HEADER.mp-bug` on the game). FCP, LCP delta and CLS pass. **Home median TBT misses the 10 ms gate by 4 ms**; game TBT passes. Gzip documents: home **12,355 → 12,358 B (+3 B)**; game **11,636 → 11,638 B (+2 B)**. Both are below 14,000 B; home passes its +20 B allocation. The game's literal unchanged-byte requirement misses by 2 B.

3. **V5:** Final production-shaped local builds on port 8704, viewport 390×844, CDP holds the full CSS request. Both have FCP, no lower computed opacities, no running animations, and no client-only `enter` or `label-swap` selector in the critical style. Hero hold-versus-settled: **0 pixels** at luminance delta ≥8 for each build. Base/M4 held hero PNGs are byte-identical. No new inline selector.

4. **V6:** CDP pointer inputs, rAF samples and long-animation-frame observers at 4× and 6× CPU cover chips/double taps, both tab systems, reset open/Cancel/Escape/success, Show all/fewer, Copy twice, invite banner/row, History filter reload and notification labels. Separate Chrome timeline traces captured the chip sequence at both rates. At 1× all measured flows had max rAF delta **16.8 ms**, no dropped frame and no long animation frame. At 4× normal-motion chip interaction duration was **120 ms** (under the 200 ms gate), but a long animation frame reached **113.5 ms**. At 6× normal-motion chip interaction duration reached **448 ms**, with a **427.3 ms** long animation frame. Other 4× normal-motion flows recorded no long animation frames; throttled History reloads and some 6× interactions exceeded the frame allowance. **V6 fails its frame/long-frame gates**; these are full filter/list rendering and navigation samples, not proof of compositor-only painting. CPU throttling on this shared host is not an Android/iOS device result; neither device was available.

5. **Behaviour / SSR:** Authenticated local curl/fetch of `/`, `/you`, `/groups`, and the created group all returned 200 with no `enter` class and no join-link input in server HTML. Pointer tab x positions were identical across switches. A forced 60-second focus refresh retained the Open, Just settled and History roots, with zero animations and no History busy state; the unrelated Slices await block still inserts its existing loading panel. An intercepted identical failed invite retained the same error node throughout pending, then replaced it and ran its entry again, with no stale positive banner. Chip changes produced no fetch and updated active selection/URL/cookie. A second local-only fixture set added 24 wagers plus matching stake ledger entries: enabled Next/Prev kept the same History holder, changed the URL to page 2 and back, and toggled `aria-busy` true then clear. Show all bets expanded 3 → 24 picks and Show fewer returned to 3, at both 4×/6× and with reduced motion; inserted picks used 150 ms normally and 120 ms reduced.

6. **V7:** Final 4×/6× reduced-motion matrix recorded only fades/colour transitions at **120 ms or less**, with no animated translate or scale. Reset dialog and backdrop close with a fade. Home reduced-motion checks recorded zero view-transition calls; M1's layout also guards navigations under reduced motion. First-arrival lists use the reviewed shared helper's 120 ms cap.

7. **V8:** Local 390×844 screen recordings of chips, both tab systems, reset, Show all/fewer, link/Copy, invite and History reload at 1× and 25% playback: `/tmp/m4-codex-local/video-1.mp4` and `video-0.25.mp4`. Frame timestamps preserve recording time. Normal first-load filmstrips of both local builds are captured under `load-base/` and `load-after/`, with timestamps in `filmstrip.json`; V5 separately establishes identical first-painted heroes.

8. **V9:** Only ticket-owned source files and this log changed. `.cursor/plans` remains untracked. No CSS for the coordinator is required.

Raw local evidence: `/tmp/m4-codex-local/` (`hold-summary.json`, `auth-frames.json`, `trace-4.json`, `trace-6.json`, `trace-summary.json`, videos). Preview evidence: `/tmp/m4-codex-evidence/`. Cleanup: local Worker/esbuild and Chrome process trees were stopped using their recorded PIDs (Chrome also closed through CDP); the final process audit found no remaining matching process. The preview lock is released.

## M6 Game document back in one round trip — 2026-11-05 — PASS (builder)

Branch: `motion/m6-game-bytes`. Implementation is `39255f8`. No PR. No production deploy. Models: build Grok 4.7, verify not run.
Files: 6 (the five below plus this log). Pieces: 4 (pruner, slip paint gate, document-size script, the two doc sentences).
No new dependency. No CSS-file edit. Money, ledger and settlement are untouched.

`WHEN_WAGER_PANEL` is gone. The pruner keeps a rule when its classes are in the server HTML, when the class is in `ALWAYS_PRESENT`, or when it is a `::view-transition-*` rule. `ALWAYS_PRESENT` is now the tour bar plus `button-secondary` and `button-sm`, because the tour mounts after hydration and before the full sheet. Navigation preview, the account chip, and `button-ghost` / `button-danger` / `button-icon` are no longer force-kept; those mounts already wait for the full sheet or open from a later tap. The arming form, the bet bar, the confirmation and the banners in `bet-slip.svelte` wait for `fullCssReady()` before they mount. The armed `selection-button-active` class is still applied on the tap, so the selection updates immediately and nothing unstyled is inserted. `$effect` does not run on the server, so that markup stays out of the document, including `?pick=`.

Deviations from the plan:

- Preview has no OAuth secrets, so a signed-out preview game page has no `wager-panel` element. The slip-byte win is the local production-shaped measurement below, not the preview document. Preview only shows the smaller `ALWAYS_PRESENT` trim (about 120 B gzip).
- Home median TBT on the after build is 15.5 ms, over the 10 ms gate. The five runs are 4, 16.5, 32.5, 5.5 and 15.5 ms. The before build already had a 12.5 ms run (median 6.5 ms). Both game pages are 0 ms before and after. This is the same host noise M1 and M4 recorded on the home graph. The home route's JavaScript did not grow for this ticket.
- Finished CLS median moved from 0.00090 to 0.00158 because three after runs landed on the 0.001585 cluster that one before run also hit. It stays under 0.002.
- While the full sheet was paused, `document.getAnimations()` was 2 outside the scorebug crop. The bug itself had opacity 1 and zero animations. Those two are the tour bar transitions, which stay in the critical sheet on purpose.
- `.app-shell:has(.buddy-launcher)` and `.topbar-inner:has(.account-standing)` remain (about 66 B and 62 B). `:has` is a state pseudo, so the pruner does not require the argument class to be in the HTML. Left alone.
- Three stake-6 wagers exist only in this worktree's local D1, from the behaviour run. Starting grant 1000, balance after the third place 982. Nothing was written to preview or production D1.
- `pnpm` warns that the engine wants Node 24.18.1 and the machine has 24.20.0. `pnpm check` still prints CHECK OK.
- `/` first-load JS is 61,289 B of a 61,440 B limit (151 B left). No home-graph bytes were added.

Local production-shaped documents, `npx wrangler dev --env preview --port 8706`, dummy auth in an uncommitted `.dev.vars`, preview `board:v1` and the two game snapshots copied into local KV. Gzip body is `curl -H 'accept-encoding: gzip' | wc -c`. Inline size is the raw `<style>` text.

| Page                                        | Before gzip | Before inline | After gzip | After inline | Gate           |
| ------------------------------------------- | ----------: | ------------: | ---------: | -----------: | -------------- |
| `/`                                         |    12,356 B |      28,843 B |   12,237 B |     28,272 B | ≤ 12,800, pass |
| Finished `football-data-575386-real-madrid` |    13,851 B |      38,583 B |   12,458 B |     30,246 B | ≤ 12,800, pass |
| Upcoming `football-data-564741-real-madrid` |    13,452 B |      37,905 B |   12,063 B |     29,568 B | ≤ 12,800, pass |

The finished page before the change matched production's 13,844 B within 7 B, and its inline sheet matched production's 38,598 B within 15 B. After the change that page is 12,458 B, 342 B under 12,800. A production document a few hundred bytes larger still clears 12,800 and the 13,000 B script. `node scripts/doc-budget.mjs` on the three local URLs printed `OK 12237`, `OK 12458`, `OK 12063`, all gzip, status 200. The script is documented under "Keeping it fast" in `docs/workflow.md` and is not part of `pnpm check`, because it needs a running server.

The finished inline sheet after the change has 70 classes in the HTML and 75 names in the CSS. The extras are the tour and secondary-button classes in `ALWAYS_PRESENT`, the `:is(.game-row, .wager-panel, .group-match-card)` group (kept because `wager-panel` is in the signed-out HTML), the two `:has` rules above, and the false positives `avif`, `webp`, `woff2` and `com`. `side-form` and `w-full` stay, because they are in the signed-out panel. Bet-bar, selection-button, banner, navigation-preview and the three dropped button variants are absent.

Acceptance (`pnpm check` prints the HEAD short sha; the gate below is `39255f8`, before this log commit):

1. `pnpm check` → `CHECK OK 39255f8`. `node scripts/budget.mjs` → `/ 61289` (limit 61440), `/games/[id] 74579` (limit 81920). No BUDGET WARN. The pre-existing `state_referenced_locally` warnings in buddy, join-link, notify-toggle and slate are still the only typecheck warnings.

2. Lighthouse 12 mobile ×5, median of each metric, one `flock /home/oscar/Projects/plan-bet-wt/locks/preview.lock` session. Before worktree `/tmp/m6-before` at `cd0b2bf`, version `e30033d6-2047-4751-aa60-91194ad935da`. After is this branch, version `bcad51cb-36a9-4e7f-b46e-0a78f41a0f62`. Queries `?m6=before` and `?m6=after`, so a cache HIT cannot serve the other build. Simulated. Chrome `/usr/bin/google-chrome`, headless. Every run scored 100. `non-composited-animations` has 0 items on every run. No runtime error and no NO_LCP. LCP node stays `section.next-up` on `/` and `header.mp-bug` on both games. Every session curl was `x-mp-cache: MISS`. A later curl of the after finished page returned `cache-control: public, max-age=0, must-revalidate, no-transform`, `content-encoding: gzip`, `x-mp-cache: MISS`, `x-mp-critical-ms: 0.00`, `x-mp-version: 58`.

| Page     | Metric   |   Before |    After | Gate                                  |
| -------- | -------- | -------: | -------: | ------------------------------------- |
| `/`      | FCP      |  0.795 s |  0.789 s | ≤ 0.82 s, pass                        |
| `/`      | LCP      |  1.358 s |  1.365 s | ≤ base + 0.05 s, pass (+0.007)        |
| `/`      | CLS      |  0.00082 |  0.00075 | ≤ 0.002, pass                         |
| `/`      | TBT      |   6.5 ms |  15.5 ms | ≤ 10 ms; after misses, see deviations |
| `/`      | Document | 12,354 B | 12,239 B | preview, no wager panel               |
| finished | FCP      |  0.786 s |  0.785 s | ≤ 0.82 s, pass                        |
| finished | LCP      |  1.214 s |  1.213 s | ≤ base + 0.05 s, pass                 |
| finished | CLS      |  0.00090 |  0.00158 | ≤ 0.002, pass                         |
| finished | TBT      |     0 ms |     0 ms | ≤ 10 ms, pass                         |
| finished | Document | 11,724 B | 11,600 B | preview, no wager panel               |
| upcoming | FCP      |  0.784 s |  0.783 s | ≤ 0.82 s, pass                        |
| upcoming | LCP      |  1.216 s |  1.212 s | ≤ base + 0.05 s, pass                 |
| upcoming | CLS      |  0.00126 |  0.00126 | ≤ 0.002, pass                         |
| upcoming | TBT      |     0 ms |     0 ms | ≤ 10 ms, pass                         |
| upcoming | Document | 11,321 B | 11,201 B | preview, no wager panel               |

Home FCP after, ms: 788.940, 788.670, 814.310, 788.699, 785.320. Before: 829.709, 782.189, 787.122, 794.922, 795.878. Home LCP after: 1363.880, 1369.340, 1366.620, 1363.398, 1364.640. Before: 1022.709, 1358.378, 1358.244, 1434.844, 1213.756. Home TBT after: 4, 16.5, 32.5, 5.5, 15.5. Before: 4, 7.5, 4.5, 6.5, 12.5. Finished FCP after: 784.593, 786.174, 780.841, 784.343, 785.861. Before: 786.184, 789.664, 784.282, 787.054, 785.546. Finished LCP after: 1213.186, 1212.348, 1203.682, 1212.686, 1213.722. Before: 1214.368, 1217.328, 1210.564, 1214.108, 1213.092. Finished TBT after: 0, 0, 0, 0, 1.5. Before: 0, 1.5, 1, 0, 0. Upcoming FCP after: 782.216, 784.217, 784.980, 781.438, 783.392. Before: 787.058, 780.620, 784.146, 780.017, 787.905. Upcoming LCP after: 1208.432, 1214.434, 1211.960, 1208.876, 1214.784. Before: 1218.116, 1213.240, 1287.292, 1212.034, 1215.810. Upcoming TBT after: 0, 0, 1, 0, 0. Before: 0, 0, 0, 0, 0.

3. Local Chrome, port 9460, profile `/tmp/m6-chrome-hold`, viewport 390×844, signed in, `locale=en`, upcoming game. CDP paused `http://127.0.0.1:8706/_app/immutable/assets/0.CaT2wTxM.css`. The LCP crop is `header.mp-bug` at x 0, y 148.1875, width 390, height 251.21875. First frame versus the settled frame while the sheet stayed paused: 0 px at luminance delta ≥ 8. Bug opacity 1, bug `getAnimations()` 0, console empty. A tap while the sheet was held mounted nothing: `.bet-bar` 0, `form.enter` 0, `.banner` 0, `.bet-confirmation` 0, `.stake-chips` 0. `.selection-button-active` was 1, so the price armed without painting the slip. After release the bar samples run translateY 259.8 → none over about 265 ms, opacity 0 → 1, `position: sticky`, `transition-duration` `0.24s, 0.15s`, bottom 65.7812 px (the tour offset).

4. Behaviour on that same signed-in upcoming page. Goals filter: visible `.selection-market` 6 → 5 (the totals category is one market smaller than popular; existing `inMarketCategory`). Stake chip +5: the input reads 1 in the same turn and 6 after two animation frames. Two intercepted POSTs to `/api/bets` returned 409 `{error:{message:"The price moved. Check it and try again."}}`. The banner kept that string and `.bet-bar` stayed at 1. The third POST was the real place. Focus moved into `.bet-confirmation`. Text: "Placed 6 on Home → returns 14. New balance: 982. Done". Soccer match-result home is 2.40, so stake 6 returns 14. Reduced motion after reload: bar `transform: none`, opacity about 0.968 mid-fade, duration `0.12s`, property `opacity, background-color, color, border-color`. Signed-out finished page: overflow 0 at 320, 390 and 1280, English "Sign in", Spanish "Iniciar sesión", `documentElement.lang` matched, console empty.

Review: not run (builder ticket; coordinator re-runs acceptance).
FOLLOWUPS: none for the coordinator. Preview cannot show the slip-byte drop until OAuth secrets exist there; the local 12,458 B finished document is the production-shaped proof. Home TBT on this host is noisy and is not a reason to put slip CSS back into the first document. `/` JS has 151 B of headroom.
Raw evidence: `/tmp/m6-lh/` (`before-summary.json`, `after-summary.json`, the thirty Lighthouse JSON files). Held-CSS crops: `/tmp/m6-shots/held-first.png`, `held-settled.png`.

## Motion pass production check (Opus, 2026-11-05)

- First production deploy of the merged motion pass (`7a2166e4`) put the signed-out finished game document at 14,651 B transferred, over the TCP initial window. FCP went to 0.98 s. Preview missed it because it renders no wager panel. Rolled back to `552de82e` within minutes. M6 removed the force-inlined slip CSS and gates slip markup on `fullCssReady()`.
- A second deploy shipped a stale bundle: `pnpm check` failed on Prettier, but the deploy still ran, because `| tail` hid the exit code. Rolled back again. The deploy now runs only after `CHECK OK`, with `pipefail` set.
- Live version `05408995`. Documents (gzip): `/` 12,206 B, finished game 12,451 B, upcoming game 12,057 B. Lighthouse 12 mobile ×5 medians:

| Page          | Score |    FCP |    LCP |    CLS |  TBT |  TTFB | Non-composited |
| ------------- | ----: | -----: | -----: | -----: | ---: | ----: | -------------: |
| `/`           |   100 | 0.79 s | 1.36 s | 0.0007 | 5 ms | 72 ms |              0 |
| finished game |   100 | 0.78 s | 1.21 s | 0.0009 | 0 ms | 55 ms |              0 |
| upcoming game |   100 | 0.78 s | 1.21 s | 0.0012 | 1 ms | 64 ms |              0 |
