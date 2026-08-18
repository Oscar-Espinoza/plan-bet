# Matchday Plan

Matchday Plan is a polished sports preparation workspace built for a portfolio/CV preview. Pick one of four teams, scan its next five date-relative games, review sport-specific matchup context, keep a personal watchlist, read an evidence-linked example briefing, and save a recap—all without an account.

This repository currently represents **Session 01: CV-ready seeded UI**. Sports data and briefing copy are deliberately labelled as demo snapshots. There are no live providers or hidden AI calls in this checkpoint.

**Live demo:** [plan-bet.vercel.app](https://plan-bet.vercel.app)

## Product surface

- Dashboard for Real Madrid, FC Barcelona, New York Yankees, and Boston Red Sox
- Five future, date-relative games per team with stable routes
- Soccer-specific standings/form/availability and baseball-specific pitching/splits context
- A prewritten demo brief whose claims link back to evidence facts in the snapshot
- Browser-local watchlist CRUD, filters, recap notes, saved/viewed briefs, and activity totals
- Responsive desktop sidebar and compact mobile navigation
- Safe, confirmed reset limited to the `matchday-plan:v1` local-storage key

## Stack

Next.js 16.2, React 19.2, TypeScript 6, Tailwind CSS 4, shadcn-style UI primitives, Lucide, Zod 4, Zustand 5, Vitest, Testing Library, and Playwright. Versions are pinned in `package.json` and `pnpm-lock.yaml`. The project targets Node 24.18.1 and pnpm 11.

## Run locally

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Quality commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test:e2e` expects a completed production build and starts `pnpm start` automatically.

## Routes and persistence

| Route         | Purpose                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `/`           | Selected team, next five games, current read, and watchlist summary            |
| `/games/[id]` | Sport-specific context, sources, demo briefing, evidence, watchlist, and recap |
| `/watchlist`  | Create, edit, complete, reopen, delete, and filter personal checks             |
| `/activity`   | Exact current totals and reverse-chronological successful actions              |

Personal state never leaves the browser. The versioned storage envelope is validated and migrated through Zod before it reaches the UI. Invalid or future-version data safely falls back to defaults.

## Honest demo limitations

- No database, authentication, or cross-device synchronization
- No live soccer/baseball APIs, real-time scores, or official injury reports
- No live AI generation—the “View demo brief” action reveals a cited example
- No odds, betting features, predictions, notifications, or social features
- Team marks are text/code-native; no third-party crest artwork is bundled

Dates move forward relative to the day the app is opened, while standings, availability, pitching, and matchup values remain plausible designed examples. Every surface that uses them says “Demo snapshot.”

## Roadmap

1. **Session 02:** PostgreSQL cache and live soccer adapter with stale/demo fallback
2. **Session 03:** Live baseball adapter through the same validated contracts
3. **Session 04:** Quota-limited, structured, evidence-grounded AI briefings
4. **Session 05:** Scheduled refresh, system status, CI, accessibility hardening, and portfolio handoff

Session 01 intentionally stops before those integrations so this commit remains a credible, self-contained CV demo.
