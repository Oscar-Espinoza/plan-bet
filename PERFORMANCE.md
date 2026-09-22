# Performance changes — September 22, 2026

The main navigation bottleneck was the matchup stylesheet suspending the route
while React prepared it. Loading that stylesheet with the shell removes the
roughly 300 ms delay even when match data has already been prefetched.

## Before and after

Five fresh Chromium contexts per build, on this machine, using production Next
builds in keyless demo mode. Baseline: commit `63bc1f7` in an isolated worktree.
Warm interactions allow one second for hydration/prefetching before each click.
Click timing uses a DOM observer followed by the next animation frame, rather
than Playwright's visibility polling. These are local measurements, not production
or signed-in network latency guarantees.

| Measurement                             | Before, median | After, median |
| --------------------------------------- | -------------: | ------------: |
| Warm match click to rendered content    |       312.6 ms |       13.1 ms |
| Sport filter click to rendered content  |        14.7 ms |       14.7 ms |
| Board requests per sport-filter click   |              1 |             0 |
| Back-to-board click to rendered content |        17.7 ms |       16.6 ms |
| Fresh browser document DOMContentLoaded |        33.9 ms |       17.7 ms |

DOMContentLoaded is not a full-page interactivity or LCP measurement. Filter
rendering was already fast locally; removing its network dependency matters on
slower connections. Cold server starts, production providers, and authenticated
end-to-end timings were not benchmarked. Private behavior is covered by component
tests and real PostgreSQL integration tests.

Reproduce browser measurements with:

```sh
pnpm exec tsx scripts/measure-navigation.ts http://localhost:3102 http://localhost:3100
```

Use separate production servers with `MATCHDAY_DATA_MODE=demo` and empty database
and provider credentials. Port 3101 belongs to the existing Vite fixture suite.

## Database evidence

PostgreSQL 18, migrated schema, 100,000 wagers and 200,000 ledger entries. Each
query was explained with its new index, then without that index inside a rolled
back transaction. The planner selected all three new indexes without disabling
sequential scans. Individual timings vary; these are representative single runs.

| Lookup                              |    Before |    After | Shared buffer hits, before → after |
| ----------------------------------- | --------: | -------: | ---------------------------------: |
| User + match                        |  0.146 ms | 0.050 ms |                              5 → 4 |
| Group + match                       |  0.227 ms | 0.052 ms |                            14 → 13 |
| Wager's stake/return ledger entries | 14.337 ms | 0.077 ms |                           2765 → 5 |

Wager history now gets settlement and final-score data through joins in one
query instead of up to three. Existing pagination and settlement semantics remain.
Run `pnpm exec vitest run --config vitest.integration.config.ts src/db/performance.integration.test.ts`
to repeat the index checks.

## Cache and rendering behavior

- Public dashboard and stored match/context caches revalidate after 30 seconds.
  Freshness labels are computed when serving data, outside the shared cache.
- Failed or absent stored reads are not saved as successful demo/cache entries.
  Demo mode bypasses shared caches; cold schedules return a labelled fallback
  and schedule refresh; unknown match IDs do not trigger provider fan-out.
- Successful sports writes, enrichment and settlement invalidate public tags.
  Refresh invalidation happens after each persisted team, including partial runs.
  CLI jobs have no Next request context and rely on the 30-second revalidation
  interval; stale-while-revalidate can serve an older response while rebuilding.
- Browser route reuse is 30 seconds, with refresh while visible and on focus
  after the interval. Up to four visible match destinations prefetch on normal connections;
  other match links and constrained connections prefetch on intent. Local sport/section changes preserve URLs.
- Match content, betting and discussion render independently. Account sections
  stream independently too. Existing input state survives background refreshes.
- Private data is never stored in the shared sports cache. Session, membership,
  wager eligibility and transactional balances remain authoritative server reads.
- Pending comments and votes render immediately and roll back on failure.
  Successful wager responses update the local balance before route refresh.
- Buddy's dialog code loads when opened.

## Validation and rollout

- Production build, TypeScript and lint pass.
- Unit suite: 420 tests, including cache freshness/failure isolation, pending
  mutation rollback, confirmed balances, refresh scheduling and streamed public
  content while authentication is unresolved.
- Existing PostgreSQL integration suite: 62 tests pass; additional index test passes.
- Production browser suite: 29 tests pass, including accessibility and local
  filter/history navigation. Buddy and navigation checks also pass after the final
  lazy-loading adjustment.
- Legacy Vite fixture suite: 6 pass, 14 fail on both this change and the unchanged
  baseline. Those tests retain older action-bar/tour/copy expectations; they are
  not a passing validation signal for either build.

Migration `0014_rare_nighthawk.sql` was applied only to disposable test databases.
Apply the checked-in Drizzle migration through the normal deployment process.
It creates three non-unique indexes and changes no records. On a large production
database, plan the index build for an appropriate maintenance window. Deploy the
app and compare real navigation latency, query duration and cache refresh load.

## Instant destination previews

Internal links now display a destination preview while Next.js navigates. Match
cards supply public matchup details, status, venue, and kickoff from the current board.
The preview is held in memory, never in URLs or persistent storage; betting,
balances, and permissions still come from the destination server render, which
also replaces the preview's public data with the latest snapshot.
The same preview serves the route loading boundary. Direct links use a skeleton.

Loading and completed matches share their breadcrumb, scorebug, countdown, and
tabs. The betting skeleton uses the real card and market grid classes and also
serves the streamed wagering fallback. Geometry checks at 320, 390, and 1280 px
in English and Spanish keep the header and tabs within one pixel of their final
positions. Unknown prices and balances remain masked and controls stay disabled.

On the local production demo build, a mobile tap displayed the match preview in
14.9 ms while the destination response was deliberately held for another second.
This measures feedback, not completion of the server request. All 38 real-app
browser tests pass, including cancellation, competing destinations, browser back,
keyboard navigation, reduced motion, and failed client-fetch recovery. The 420
unit tests and automatic quality checks also pass locally.

Automatic CI runs formatting, lint, typecheck, unit tests, and a production build.
Run **Extended checks** manually in GitHub Actions for migration drift, PostgreSQL
integration, and real-app Playwright tests. Each check still fails on errors.
`pnpm test:fixtures` remains available locally but is excluded from both workflows:
its old fixed action-bar and tour expectations need updating for the current UI.
