# Matchday Plan

Matchday Plan (repo `plan-bet`): a Next.js 16 App Router workspace for practicing wager calls on real upcoming fixtures for four teams (Real Madrid, Barcelona, Yankees, Red Sox), with source-backed context, sign-in-gated accounts, and a free-to-play wager simulator on fictional credits. Deployed at plan-bet.vercel.app.

Stack: Next.js 16, React 19, TypeScript, Drizzle on Neon PostgreSQL, Auth.js, OpenAI Responses API; pnpm 11, Node 24.18.1.

Side project — move fast: no tests. Validate with `pnpm lint`, `pnpm typecheck` and `pnpm build`; `pnpm format` before committing. Commands: `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm db:generate` / `pnpm db:migrate` after a schema change.

## Rules

- Layering is one-directional: provider adapter → service (`src/data/*`) → route/page. UI and routes never import provider raw types; everything crossing a layer goes through `src/lib/contracts.ts`.
- Provider payloads are validated and normalized before rendering or persistence. Fallback chain: fresh live → expired last-known-good (`stale`) → seeded `demo`. A failed refresh never overwrites last-known-good. Missing data renders "Not provided" — never infer or pad.
- Secrets are server-only (`server-only` imports). Missing `DATABASE_URL` / provider tokens / `OPENAI_API_KEY` must not break a build or a page.
- Wagers and the credit ledger are append-only; balance is a ledger sum; settlement is decided by the provider result alone and pays once. Prices are the app's fixed house table, re-read server-side, never client-supplied.
- The buddy only receives facts the server derived from the route; every `[fact-id]` must resolve or the reply is retracted. It names a selection, never places one.
- `DESIGN.md` is the design authority: one lime accent, money never takes it. Edit the existing CSS rule for a selector instead of appending an override.
- Keep it fast: no zod in client components, server-render and pass only rendered fields, size and lazy-load images, fonts via `next/font/local`.
- Fictional credits only: no real money, bookmakers, notifications, live play-by-play or social feeds ([full scope](docs/history.md#scope)).

## Index

Read the doc for the area you're changing; nothing else is needed up front.

| When you're…                                                    | Read                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Running, building, checking performance, or touching UI/CSS     | [docs/workflow.md](docs/workflow.md)                                                    |
| Changing colours, type, spacing or components                   | [DESIGN.md](DESIGN.md), product principles in [PRODUCT.md](PRODUCT.md)                  |
| Touching providers, `src/data`, contracts or API routes         | [docs/data.md](docs/data.md), narrative in [docs/architecture.md](docs/architecture.md) |
| Touching bets, credits, settlement or groups                    | [docs/wagers.md](docs/wagers.md)                                                        |
| Touching the AI buddy                                           | [docs/buddy.md](docs/buddy.md)                                                          |
| Changing behaviour from a planned session, or questioning scope | [docs/history.md](docs/history.md)                                                      |
| Deploying                                                       | [docs/architecture.md › Deployment order](docs/architecture.md#deployment-order)        |
| Optimising load or navigation                                   | [PERFORMANCE.md](PERFORMANCE.md)                                                        |
| Adding a market                                                 | [docs/market-data-coverage.md](docs/market-data-coverage.md)                            |
