# Matchcentre — migration record

What changed when the UI moved from **Slant** (light concrete, sheared plates,
an angled ribbon) to **Matchcentre**, and what to be careful of when touching
it next. Values live in [`matchcentre-tokens.md`](./matchcentre-tokens.md).

## Why

Slant shipped (`ca55562`, `3efa0fb`, `121f955`) and, seen running, read as the
wrong product — a poster, not a club site. Matchcentre was the second of the
three concepts on the canvas and the one that survived contact with the app.

This was a forward migration, not a revert: `ca55562` also brought the
`browser-fixtures/` harness and `ResizeObserver` band measuring, and `121f955`
brought real team crests — all three of which Matchcentre wanted.

## What changed

**Palette** went back to the pre-Slant dark tokens, recovered verbatim from
`8877200:src/app/globals.css`, plus a new per-page club-accent layer
(`src/lib/club-accent.ts`, `--club` / `--club-on` / `--club-lit`).

**Geometry** went flat. Every `transform: skewX()` and every `clip-path` is
gone, and with them the `.plate-content` counter-shear wrapper that existed
only to keep type upright inside a sheared box — removed from `ui/button.tsx`,
`app-shell.tsx`, `bet-slip.tsx`, and both game-route error pages. Both radius
tokens are `0`.

**The ribbon became an action bar.** `src/components/ribbon.tsx` →
`src/components/action-bar.tsx`, keeping `useBandHeight` and the portal layer
but dropping the `clock` target. The bar renders on a game page only; the
board's countdown moved into the next-match card, where the reference puts it.
The stake input and its chips moved from the panel into the bar beside the
button they feed — still owned by the form in the panel via `form={formId}`,
so native validation and Enter-to-submit are unchanged.

**New markup**, all in `src/components/slate.tsx`: `.board` (the accent
scope), `.board-hero` (crest-led), and `.game-row-next`. The `.next-up` card
was restructured from a left-ruled plate into the centred crest-V-crest card.

**Deleted**: `.ribbon*`, `.plate-content`, `.slate-row-live`,
`.buddy-launcher-raised`, `.game-venue` (the venue moved into `.game-meta` —
a dropped column, not a dropped fact).

**Metadata** — `layout.tsx` viewport, `icon.tsx` and `opengraph-image.tsx` —
returned to the dark palette and lost their shears.

## Deviations from the reference frames, and why

- **The crest block in the topbar is chalk, not club colour.** The topbar sits
  above the accent scope, which is server-rendered on `.board` / `.mp`; making
  it club-coloured would need a client effect and would flash on every
  navigation. A mark that changed colour per fixture also reads as a different
  site each time.
- **The primary action is chalk, not the accent.** See invariant 3 in the
  tokens file.
- **The hero uses the real crest, not the concept's placeholder artwork.**
  `121f955` landed actual crests, so the flat-vector stand-in was never built.
- **The countdown carries the accent.** Slant reserved one colour for time;
  with a per-fixture accent there is only one accent, so it does both. Money
  staying neutral — the half of the old rule that mattered — is unchanged.

## Second pass, after seeing it on a phone

Four things the first pass got wrong, all fixed:

- **Fixture rows overflowed.** `.game-opponent` was a flex row carrying
  `text-overflow: ellipsis`, which only clips a _block_ container's own inline
  content — so both names overflowed and painted over each other. It is now a
  flex row where each name is its own overflow context, so the two sides
  truncate together.
- **The next-match card misaligned** whenever an opponent had no crest (a
  cached row predating the crest columns, or a provider that never sent one).
  `.next-up-teams` is now a `1fr auto 1fr` grid with a reserved `3.4rem` crest
  row, so a missing crest leaves a gap instead of pulling the name up a row.
- **Cards were inset** by the page gutter, which the reference does not have.
  See "Full bleed" in the tokens file.
- **The hero had no artwork.** `pitch-art.tsx` now draws the playing surface
  behind both the board hero and the scorebug.

Two knock-on fixes: the row's meta line went with the table shape (its
competition and venue were the reason it wrapped at 390px), and `.mp-versus`
stopped knocking out the rule with a `--slat` chip — with artwork behind the
panel that chip read as a solid box, so the rule now starts after the letter
instead of running under it.

## Traps

- **Source order beats media queries at equal specificity.** The desktop
  `position: fixed` for `.action-bar` has to sit _beside_ the base rule, not in
  the shell's own `@media (min-width: 1024px)` block near the top of the file —
  that block is declared earlier and loses.
- **A painted row must repaint every descendant.** `.game-row-next *` is
  written as `.game-row.game-row-next *` so it outranks the per-element colour
  rules declared further down; without that, `.game-versus` kept `--faint` and
  axe failed at 4.26:1 on Yankees navy.
- **Edges take `--club-lit`, fills take `--club`.** Yankees navy as a 3px edge
  on near-black is invisible.
- **Crests need `flex: 0 0 auto`** inside `.game-opponent`, which is
  `overflow: hidden; white-space: nowrap` — at 320px they otherwise shrink to
  nothing and the test reports them hidden rather than missing.
- **A scrim must be a flat block, not a gradient.** The palette has no
  gradients, and a hard edge is what keeps the contrast arithmetic over the
  artwork simple enough to reason about.
- **Content over a scrim needs its own `z-index`.** The scrim is 2; hero type
  is 3. Giving it `position: relative` alone puts it _under_ the scrim and
  greys out the headline.
- **`pnpm test:e2e` and `pnpm test:fixtures` are the real gates.** Both run
  axe, and a data-driven accent is exactly the kind of change that passes 356
  unit tests and fails contrast.

## Verification

The full gate, all green at the time of the migration:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && \
  pnpm test:integration && pnpm build && pnpm test:e2e && pnpm test:fixtures
```

`e2e-fixtures/shell.spec.ts` (was `slant.spec.ts`) keeps every assertion it had
— armed and unarmed states, stake changes, exact-score entry, group choice,
pending, native invalid input, insufficient credits, request failure, success,
closed/unavailable/signed-out, route cleanup, sport-filter changes, hydration
and delayed targets, keyboard focus, the ruled selection grid, simultaneous
action-bar/tour/buddy geometry across five viewports, and axe — retargeted from
`.ribbon-*` to the action bar and the next-match card.
