# Workflow

Side project, optimized for speed of change and of the shipped app.

- **No tests, screenshots or evidence records.** Don't add test suites, Playwright or validation docs.
- After a change: `pnpm lint`, `pnpm typecheck` and `pnpm build`; `pnpm format` before committing. For UI changes, run `pnpm build && pnpm start` (add `MATCHDAY_DATA_MODE=demo DATABASE_URL=` for the keyless demo) and check the affected page at phone width (320–430px) and in Spanish, watching the console.
- Missing `DATABASE_URL` / `FOOTBALL_DATA_API_TOKEN` / `OPENAI_API_KEY` must still build and browse — that is what CI proves.
- Commit only when asked. Keep unrelated work intact.

## Commands

```bash
pnpm dev
pnpm build && pnpm start
pnpm format:check && pnpm lint && pnpm typecheck && pnpm build   # what CI runs

pnpm db:generate   # drizzle-kit generate after editing src/db/schema.ts
pnpm db:migrate
pnpm db:seed       # idempotent team seed
pnpm test:seed <email>   # seed a usability-session account: settled wagers and a group
pnpm data:refresh:soccer   # manual provider refresh (needs DATABASE_URL + real tokens)
pnpm data:refresh:baseball
```

Node 24.18.1 / pnpm 11 are pinned in `engines`. Scripts load `.env.local` via `--env-file-if-exists`.

## Keeping it fast

- No zod (or other validation libraries) in client components: the browser gets our own already-validated data, so narrow it with a type and a cheap check. `storage.ts` is a hand-written guard for the same reason.
- Server-render what you can; pass client components only the fields they render (the board gets `BoardData`, the game page a server-built `MatchView`).
- Images: size assets to their largest rendered size (crests 160px, stadium 800px on phones); lazy-load anything below the hero; preload the LCP image from the page.
- Fonts go through `next/font/local` (`src/app/fonts.ts`), never a CSS `@import`.
- Measure with Lighthouse mobile against a production build before and after a performance change; see [PERFORMANCE.md](../PERFORMANCE.md).

## UI conventions

**`DESIGN.md` is the design authority** (the older Matchcentre docs in `docs/design/` are historical). Night-match navy surfaces, cool hairline borders, 8/11px radii, stadium imagery behind the next-match card and the scorebug, and **one acid-lime accent** (`--club`, text on it `--club-on`, lime as text `--club-lit`) for the primary action, active navigation and filters, the selected price and live emphasis. Tokens live in the single `:root` block at the top of `globals.css`; `--gutter` is the page's side inset (12 / 14 / 24px at ≤430 / default / ≥1024) and every full-bleed block cancels exactly it; `--tap` is 44px. Breakpoints are 430 / 640 / 1024 only (plus 900/1100 inside the matchup grid). Money is never the accent: balances, stakes, prices and returns stay chalk and mono, with field/clay only on a settled outcome — a price turns lime only as the armed selection. Archivo display headings, IBM Plex Sans body, DM Mono with tabular numerals on every figure, all three loaded through `next/font/local` in `src/app/fonts.ts` (latin subset, preloaded) — not CSS `@import`. The tracked team's colour survives only as the scorebug's tracked-side stripe (`--mp-club`).

When editing CSS, add to the rule for that selector rather than appending an override further down: an earlier "migration" layer did that and left ~210 dead declarations. A later identical selector wins regardless of what sits between, so check for one before adding a rule.

`AppShell` owns the header, the scroller and the bottom nav — three tabs, Games / You / Groups; Rules, System, language and sign out are rows under /you Settings. The tour bar shows on `/` and `/games/*` only (the pages its steps describe), Buddy on every other page. `useBandHeight` (`src/components/band-height.ts`) measures `--nav-h` and `--tour-h`; `viewportFit: "cover"` makes the nav's safe-area padding real. The footer, which always starts below the fold (`.main-content` is at least one scroller tall), carries the tour clearance, so nothing on screen moves when the tour mounts.

The bet slip's stake, returns and Place live in `.bet-bar`, rendered after the markets (DOM order is visual order) and `position: sticky; bottom: var(--tour-h)` inside the slip — so `.wager-panel` uses `overflow: clip`, never `hidden`, which would make it a scroll container and stop the bar sticking. The stake is a numeric text input associated with the slip's form by id, so native validation and Enter still submit; placing turns the bar into a focused confirmation.

Times render on the server in the viewer's geolocated zone (`RequestClockProvider` in the root layout, from `x-vercel-ip-timezone`) and switch to the browser's zone in the render after hydration — never blank until JS runs, and never `suppressHydrationWarning` (that froze the server text in place once). Fixture rows are one line — game, kickoff, chevron — with both names sharing the width and each carrying its own ellipsis. Row crests lazy-load; only the hero crests pass `priority`. Football crests are 160px WebP (`scripts/resize-crests.sh` for new ones). Fictional credits remain non-withdrawable; prices and markets come from the existing house table.
