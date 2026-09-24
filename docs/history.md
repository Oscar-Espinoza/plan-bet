# Planning history and scope

Read before changing behaviour a planned session covers.

Work is planned as numbered sessions in `docs/implementation/` (gitignored) covering sessions 01–10: 01–05 the original browsing workspace (03 workspace core; 04 grounded AI briefings via OpenAI Responses API — **removed**, see [buddy.md](buddy.md) for the surviving AI surface; 05 scheduled refresh, `/api/cron/refresh`, CI, a11y), 06–09 the wager simulator milestone (06 accounts and credit ledger, 07 result ingestion and the fixed house price table — 07b replaced an earlier odds-API plan, there is no odds feed — 08 placing and locking a wager, 09 settlement, history, and record), 10 groups. A later redesign (lettered phases A–C, shipped; cross-cutting first-run polish) is recorded in the planning tool's own plan file, not in `docs/implementation/` — read the relevant session file, or the plan, before changing behavior each covers.

## Scope

Out of scope, revised: **suggestions are permitted when they run on fictional credits, are grounded in cited evidence, and are never framed as advice about real-money wagering** — this is what a future buddy feature is allowed to be. Still out, no exception: real-money betting, notifications, live play-by-play, social feeds/reactions, RAG/vector search, cross-device sync of browser-local state.
