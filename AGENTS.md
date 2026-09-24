# Matchday Plan

Matchday Plan (repo `plan-bet`): a Next.js 16 App Router workspace for practicing wager calls on real upcoming fixtures for four teams (Real Madrid, Barcelona, Yankees, Red Sox), with source-backed context, sign-in-gated accounts, and a free-to-play wager simulator on fictional credits. Deployed at plan-bet.vercel.app.

Work is planned as numbered sessions in `docs/implementation/` (gitignored) covering sessions 01–10: 01–05 the original browsing workspace (03 workspace core; 04 grounded AI briefings via OpenAI Responses API — **removed**, see [docs/buddy.md](docs/buddy.md) for the surviving AI surface; 05 scheduled refresh, `/api/cron/refresh`, CI, a11y), 06–09 the wager simulator milestone (06 accounts and credit ledger, 07 result ingestion and the fixed house price table — 07b replaced an earlier odds-API plan, there is no odds feed — 08 placing and locking a wager, 09 settlement, history, and record), 10 groups. A later redesign (lettered phases A–C, shipped; cross-cutting first-run polish) is recorded in the planning tool's own plan file, not in `docs/implementation/` — read the relevant session file, or the plan, before changing behavior each covers.

Next.js 16 App Router, React 19, TypeScript, Drizzle on Neon PostgreSQL, Auth.js, OpenAI Responses API. pnpm 11, Node 24.18.1.

Side project — move fast: no tests. Validate with `pnpm lint`, `pnpm typecheck` and `pnpm build`; `pnpm format` before committing. Commands: `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm db:generate` / `pnpm db:migrate` after a schema change.

## Rules

- Layering is one-directional: provider adapter → service (`src/data/*`) → route/page. UI and routes never import provider raw types; everything crossing a layer goes through `src/lib/contracts.ts`.
- Provider payloads are validated and normalized before rendering or persistence. Fallback chain: fresh live → expired last-known-good (`stale`) → seeded `demo`. A failed refresh never overwrites last-known-good. Missing data renders "Not provided" — never infer or pad.
- Secrets are server-only (`server-only` imports). Missing `DATABASE_URL` / provider tokens / `OPENAI_API_KEY` must not break a build or a page.
- Wagers and the credit ledger are append-only; balance is a ledger sum; settlement is decided by the provider result alone and pays once. Prices are the app's fixed house table, re-read server-side, never client-supplied.
- The buddy only receives facts the server derived from the route; every `[fact-id]` must resolve or the reply is retracted. It names a selection, never places one.
- `DESIGN.md` is the design authority: one lime accent, money never takes it. Edit the existing CSS rule for a selector instead of appending an override.
- Keep it fast: no zod in client components, server-render and pass only rendered fields, size and lazy-load images, fonts via `next/font/local`.
- Out of scope, revised: **suggestions are permitted when they run on fictional credits, are grounded in cited evidence, and are never framed as advice about real-money wagering** — this is what a future buddy feature is allowed to be. Still out, no exception: real-money betting, notifications, live play-by-play, social feeds/reactions, RAG/vector search, cross-device sync of browser-local state.

## Index

| Topic                                                  | Doc                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| Workflow, commands, performance habits, UI conventions | [docs/workflow.md](docs/workflow.md)                                |
| Layering, data rules, API conventions                  | [docs/data.md](docs/data.md)                                        |
| Architecture narrative, caching, deployment order      | [docs/architecture.md](docs/architecture.md)                        |
| Wager simulator rules                                  | [docs/wagers.md](docs/wagers.md)                                    |
| Buddy (grounded AI)                                    | [docs/buddy.md](docs/buddy.md)                                      |
| Design system                                          | [DESIGN.md](DESIGN.md), product principles [PRODUCT.md](PRODUCT.md) |
| Performance history and numbers                        | [PERFORMANCE.md](PERFORMANCE.md)                                    |
| Market data coverage                                   | [docs/market-data-coverage.md](docs/market-data-coverage.md)        |
