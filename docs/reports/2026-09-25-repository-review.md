**Repository review — 2026-09-25**

Reviewed the current repository at `55062a6` on `perf/mobile-pass`, as requested. The working tree was clean when the review began. Focus: wager and ledger consistency, result ingestion, settlement, group authorization, buddy grounding and quotas, migration checks, and documented scope.

Findings below are concrete failure paths. **P1** means high priority because the issue can produce incorrect ledger outcomes or bypass a security boundary. **P2** means a material correctness, reliability, scalability, or requirements issue worth fixing.

Validation consisted of source tracing and local, in-memory probes of the existing normalizers, grading function, and buddy parser. The probes reproduced findings 1, 3, and 10 with synthetic inputs; concurrency findings are derived from the transaction ordering in source, not a live database experiment. No provider, model, database, or email service was contacted. No application code or tests were changed, and application build checks were not run for this report-only change.

**1. [P1] A live score can irreversibly settle a wager**

Evidence: [settlement.ts:125](../../src/data/settlement.ts#L125), [football-data/normalize.ts:93](../../src/providers/football-data/normalize.ts#L93), [mlb-stats/normalize.ts:103](../../src/providers/mlb-stats/normalize.ts#L103), [markets.ts:332](../../src/lib/markets.ts#L332).

Both adapters construct `GameSummary.result` whenever scores exist, without requiring `status === "finished"`. Settlement only skips a scheduled/live game when it has **no** result, and `gradeSelection` does not require a final status either. A normalized live game at 1–0 therefore grades a home selection as won. The local probe reproduced this for both sports. The insert creates the unique return row, so the actual final score cannot correct that wager on a later run. The same premature score is also described as a final-score evidence fact.

Change: reserve settlement results for provider-confirmed finals and independently require an explicit terminal status in settlement. Handle cancellation/postponement as their own void cases; do not treat score presence as proof of completion.

**2. [P1] Reset and placement can commit a negative balance**

Evidence: [credits.ts:84](../../src/data/credits.ts#L84), [wagers.ts:102](../../src/data/wagers.ts#L102), [contracts.ts:231](../../src/lib/contracts.ts#L231).

Reset acquires advisory-lock class 3; placement acquires class 4. These locks do not exclude one another even for the same account. With a balance of 2,000, a reset can read 2,000 and prepare a −1,000 entry while placement reads the same balance and accepts a 1,500 stake. Both transactions can commit, leaving −500. Neither operation alone permits that outcome, and the summary schema accepts negative balances. Separate transactions and the append-only ledger do not prevent this race.

Change: use the same per-account balance lock for reset and placement, with the balance read and debit/reset calculation inside that protected transaction.

**3. [P1] Cancelled fixtures never reach the voiding path**

Evidence: [football-data/normalize.ts:181](../../src/providers/football-data/normalize.ts#L181), [mlb-stats/normalize.ts:241](../../src/providers/mlb-stats/normalize.ts#L241), [sports-repository.ts:201](../../src/data/sports-repository.ts#L201), [settlement.ts:125](../../src/data/settlement.ts#L125).

The normalizers only emit snapshots for selected upcoming statuses and recent finished games. Neither set includes `cancelled`. Feeding a cancelled fixture into either normalizer produced zero snapshots locally. If that fixture previously had a scheduled snapshot, persistence leaves the old `games.summary` in place; settlement sees scheduled/no-result and skips it indefinitely. Published rules promise cancellation returns the stake. Postponements first observed after the upcoming date window also lack a reliable reconciliation path, and a missed final older than the seven-day retention cutoff cannot repair an open wager through the normal refresh.

Change: separate updates to known games from the five-game schedule projection. Reconcile unresolved wager fixtures until the provider supplies a terminal result/status, including cancellations, independently of browsing and retention windows.

**4. [P1] A quota-store failure enables unmetered paid buddy calls**

Evidence: [buddy.ts:406](../../src/data/buddy.ts#L406), [buddy.ts:421](../../src/data/buddy.ts#L421), [api/buddy/route.ts:94](../../src/app/api/buddy/route.ts#L94).

An exception from `claimBuddyTurn` is logged and converted to `undefined`; the function then calls `streamLive` anyway. An absent database takes the same unmetered path whenever an OpenAI key exists. The endpoint intentionally permits anonymous callers, so there is no account gate or alternative quota protecting these requests. A broken quota table or failed quota transaction therefore removes both spending limits precisely when persistence cannot enforce them. Graceful page degradation does not require continuing paid generation.

Change: require a successful quota reservation before a paid call. On unavailable metering, return a deterministic response or a temporary-unavailable result while keeping browsing functional.

**5. [P2] The settlement batch can permanently starve later wagers**

Evidence: [settlement.ts:94](../../src/data/settlement.ts#L94), [settlement.ts:117](../../src/data/settlement.ts#L117), [settlement.ts:184](../../src/data/settlement.ts#L184).

The query takes the first 200 open wagers by scheduled time before checking whether they can be graded. Skipped or failed rows remain open, and the next invocation selects them again. Once 200 old wagers are stuck on missing results, invalid summaries, or unresolved selections, every later completed wager is excluded forever. Finding 3 provides a current way to accumulate such rows; merely increasing the batch size only moves the failure threshold.

Change: select terminal-status candidates before limiting, and use bounded pagination that advances past malformed/unresolvable rows. Keep failures observable without allowing them to monopolize every future run.

**6. [P2] Retrying an uncertain placement debits the account again**

Evidence: [bet-slip.tsx:257](../../src/components/bet-slip.tsx#L257), [bet-slip.tsx:278](../../src/components/bet-slip.tsx#L278), [contracts.ts:245](../../src/lib/contracts.ts#L245), [wagers.ts:119](../../src/data/wagers.ts#L119).

Placement has no request identity or idempotency constraint. If the transaction commits but its response is lost, the slip reports that the bet did not go through and tells the user to retry. Retrying the same 100-credit submission creates another wager and another debit whenever the balance permits it. The advisory lock serializes both submissions successfully; it does not identify them as the same action. Awaiting notification work after commit also extends the period in which the wager exists but the client has no confirmation.

Change: assign a stable idempotency key to each placement intent, enforce uniqueness per user in the transaction, and return the original result on retries. Preserve the key after an ambiguous transport failure.

**7. [P2] The kickoff check happens before a potentially blocking transaction**

Evidence: [wagers.ts:76](../../src/data/wagers.ts#L76), [wagers.ts:90](../../src/data/wagers.ts#L90), [wagers.ts:102](../../src/data/wagers.ts#L102).

The game is read and availability checked before opening the database transaction and waiting for the account lock. A request that passes just before kickoff can wait behind another placement, acquire the lock after kickoff, and still insert a wager. A provider status change during that interval is similarly ignored. No availability check occurs at the protected write boundary, despite the product requiring started/closed fixtures to reject placement.

Change: re-read and recheck availability after acquiring the account lock and close to the insert. Coordinate the game read with status updates, or enforce the relevant status/time predicate in the write itself.

**8. [P2] Invite acceptance can overwrite a completed revocation**

Evidence: [groups.ts:246](../../src/data/groups.ts#L246), [groups.ts:292](../../src/data/groups.ts#L292), [groups.ts:325](../../src/data/groups.ts#L325).

Acceptance reads a pending invite under a token advisory lock, but revocation never acquires that lock. Acceptance can read pending, revocation can commit revoked, and acceptance can then insert membership and unconditionally change the invite to accepted. This can resurrect an invite after another request has already observed the revoked state. The accepting transaction does not lock the invite row or condition its final transition on it still being pending.

Change: serialize both operations on the same invite row, or atomically claim a pending, unexpired invite with a conditional update and only create membership when that claim succeeds.

**9. [P2] Partial enrichment failures overwrite last-known-good facts**

Evidence: [fixture-context-repository.ts:26](../../src/data/fixture-context-repository.ts#L26), [fixture-context.ts:79](../../src/data/fixture-context.ts#L79), [fixture-context.ts:358](../../src/data/fixture-context.ts#L358), [fixture-context-repository.ts:102](../../src/data/fixture-context-repository.ts#L102).

Expired provider-cache rows are excluded from reads. A failed refresh becomes `undefined`, but if another source returns any facts, enrichment replaces the entire existing fact array. For example, a failed injury refresh plus a successful standings refresh deletes the previously stored injury evidence and advances `builtAt`, delaying another attempt. Only a completely empty rebuild is protected. This violates the explicit rule that a failed refresh preserves last-known-good data and serves it as stale.

Change: track success/failure separately from a successful empty response for each source. Retain failed sources' last-known-good facts with their original timestamps and stale status while replacing facts from sources that refreshed successfully.

**10. [P2] Unknown citations pass validation when the evidence set is empty**

Evidence: [buddy-validation.ts:143](../../src/lib/buddy-validation.ts#L143), [buddy.ts:177](../../src/data/buddy.ts#L177).

The unknown-fact check is inside `if (allowedFactIds.length > 0)`. With no facts, `parseBuddyReply("Madrid won yesterday [invented-fact]", { allowedFactIds: [], allowedPickIds: [] })` returns `ok: true` and records `invented-fact`; this was reproduced locally. Empty context is a supported path, including signed-out `/you`, unavailable group context, or an empty board. The rule that every citation must resolve therefore stops applying exactly when no citation could possibly be valid.

Change: always reject markers outside the allowed set, even when the set is empty. Only the requirement to include at least one citation should depend on evidence being available.

**11. [P2] A stream ending without a terminal frame leaves unvalidated prose visible**

Evidence: [buddy.tsx:127](../../src/components/buddy.tsx#L127), [buddy.tsx:154](../../src/components/buddy.tsx#L154), [buddy.tsx:79](../../src/components/buddy.tsx#L79).

The browser breaks on reader EOF without checking whether it received a `done` event. If the response closes cleanly after deltas but before the terminal grounding verdict, those deltas remain in the transcript with `ok` unset. The pending flag is cleared, and the next question includes that unfinished reply in history because the filter only excludes `ok === false`. The provider client checks its own completion, but that cannot guarantee delivery of the server's terminal frame to the browser.

Change: require a valid terminal frame before accepting a turn. Retract provisional text on EOF without one, and include only successfully finalized buddy turns in subsequent history.

**12. [P2] Schema health reports current even with required migrations missing**

Evidence: [db/client.ts:68](../../src/db/client.ts#L68), [api/health/route.ts:80](../../src/app/api/health/route.ts#L80), [0013_puzzling_blindfold.sql](../../drizzle/0013_puzzling_blindfold.sql), [architecture.md](../architecture.md#deployment-order).

Schema health checks table names only. A database migrated through `0012` contains every expected table, so it reports `schema: "current"` even without `0013`, which adds `game_comments.parent_comment_id`. Current thread reads and comment inserts reference that missing column and fail. Missing indexes in `0014` are also invisible. The documented deployment gate therefore cannot establish the schema currency it claims to establish.

Change: compare the applied migration journal with the migration expected by the deployed build, while retaining the connectivity/table checks as diagnostics. Do not label table existence alone as schema currency.

**13. [P2] Valid ledger entries can overflow account aggregates and block recovery**

Evidence: [credits.ts:16](../../src/data/credits.ts#L16), [credits.ts:103](../../src/data/credits.ts#L103), [wagers.ts:107](../../src/data/wagers.ts#L107), [markets.ts:418](../../src/lib/markets.ts#L418).

`MAX_STAKE` bounds an individual potential return to an int4, but balance and lifetime totals also cast their sums to int4. Multiple valid returns can push lifetime returned above 2,147,483,647 even when each entry and the current balance fit. Once a lifetime aggregate overflows, `/you` fails and placement/reset transactions fail when they select `SUMMARY_PROJECTION`. Reset cannot repair a lifetime total because it is append-only and the aggregate excludes reset entries. The per-wager bound does not make the ledger aggregates safe.

Change: retain wide aggregate types and convert them deliberately at the TypeScript boundary. Define compatible bounds for reset deltas if the total balance can exceed the individual-entry column range.

**14. [P2] Shipped notifications and reactions contradict the explicit scope**

Evidence: [AGENTS.md](../../AGENTS.md), [history.md:9](../history.md#scope), [group-notifications.ts:18](../../src/data/group-notifications.ts#L18), [schema.ts:350](../../src/db/schema.ts#L350), [game-comments.ts:310](../../src/data/game-comments.ts#L310).

Current instructions prohibit notifications, and the scope document additionally excludes social feeds/reactions with no exception. Placement and settlement nevertheless send activity emails whenever mail is configured, new memberships enable notifications by default, and comment voting implements shame/slander reactions. These are active product paths, not unused scaffolding. Keeping them also adds external email work to wager operations despite the declared scope.

Change: remove or disable the prohibited activity notifications and reactions under the current requirements. If retaining them is an intended product decision, explicitly revise the governing scope before treating these paths as compliant.
