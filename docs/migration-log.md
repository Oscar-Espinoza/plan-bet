# Cloudflare migration log

Spec: [cloudflare-migration-spec.md](cloudflare-migration-spec.md).

## How this run is executed

- Builders run headless through the Cursor CLI (`cursor-agent -p`), one git worktree per ticket under `/home/oscar/Projects/plan-bet-wt/`. Grok 4.7 (`grok-4.7-high`) builds even tickets; Composer 2.5 (`composer-2.5`) builds odd tickets. GLM and DeepSeek were the first choice but are not included in the Cursor plan; Oscar chose the included models.
- The coordinator (Claude Opus 5.5, Claude Code session) writes each ticket plan to `.cursor/plans/Txx.md`, reviews the result, sends findings back to the same builder chat, and merges into `cf/main` after review passes. Oscar asked for the run to continue without per-ticket approval; production (T15) still waits for Oscar.
- Bugbot and Agent Review are not used in this headless run; the coordinator's review plus a fresh-context reviewer on Tier A tickets replace them.

## Builder scorecard

| Ticket | Tier | Builder      | Plan followed | Gate loops | Review rounds | Blocker / major / minor | Invariant breaks | SvelteKit 2 slips | Invented APIs | Sandbox | Outcome | Wall time | Cost     |
| ------ | ---- | ------------ | ------------- | ---------- | ------------- | ----------------------- | ---------------- | ----------------- | ------------- | ------- | ------- | --------- | -------- |
| T00    | B    | Grok 4.7     | yes           | 0          | 1             | 0 / 0 / 0               | 0                | 0                 | 0             | clean   | PASS    | 21.5 min  | included |
| T01    | B    | Composer 2.5 | yes           | 0          | 1             | 0 / 0 / 1               | 0                | 0                 | 0             | clean   | PASS    | 2.8 min   | included |

## Coordinator notes

- T00 review (Opus): gate re-run `CHECK OK 5015ec1`; legacy demo build passes; preview health healthy (D1 `select 1` 172 ms from the São Paulo edge to the ENAM primary). Grok's note is correct: adapter-cloudflare 8 passes no `platform` to `server.respond`, so bindings come from `import { env } from "cloudflare:workers"` (and `waitUntil` from the same module). Later plans use that instead of `platform.env`/`platform.ctx`.

- T01 review (Opus): gate `CHECK OK 05a8e61`; every verbatim port diffs clean against legacy except the planned `PUBLIC_SITE_URL` line in `email.ts`; both JSON files byte-identical; no runtime zod/node/server import in `src/lib/shared`. Minor: `api-response.ts` dropped the `ApiSuccess`/`ApiFailure` body types when moving to `Response` (no behaviour change).

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
