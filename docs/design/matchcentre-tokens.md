> **Historical.** Matchcentre was replaced by the lime night-match design in `DESIGN.md`, which is the current authority. Kept for the reasoning behind decisions that carried over (money never takes the accent, mono figures).

# Matchcentre — design tokens

The palette and surface contract for the shipped UI. This file is the source of
truth for _values_; [`matchcentre-migration.md`](./matchcentre-migration.md)
records how the app got here and what to watch when changing it.

Reference frames (the concept, before implementation):
[`matchcentre-board.png`](./matchcentre-board.png),
[`matchcentre-matchup.png`](./matchcentre-matchup.png) — 390×844.
Canvas, with the two directions not taken on its second page:
<https://claude.ai/code/artifact/f430b7ac-835e-4f2c-8e2e-7c826558e479>

Current product screenshots live in [`../screenshots/`](../screenshots).

## The direction in one paragraph

A club website compressed onto a phone. Near-black ground, slat panels,
hairline rules, flat square surfaces — and **the club colour of the fixture you
are looking at as the page accent**. A crest-led hero, a centred crest-v-crest
"NEXT MATCH" card, a fixture table whose next row is painted in club colour,
and a sticky action bar on a game page. No gradients, no glass, no glow, no
chat bubbles, nothing sheared or clipped.

## Three invariants

1. **The accent is per-page and comes from data.** `--club`, `--club-on` and
   `--club-lit` are written as inline custom properties by the server
   (`src/lib/club-accent.ts`) onto `.board` and `.mp`. Nothing else may set
   them. A page with no fixture — `/you`, `/groups`, `/rules`, `/system` —
   falls back to the neutral defaults and simply has no accent.
2. **Money is never the accent.** Balances, stakes, prices and returns are
   chalk and mono; `--field` / `--clay` appear only on a settled outcome. The
   accent does identity and time: crest rings, the tracked-side stripe, the
   painted row, the countdown, block titles, the armed selection.
3. **The primary action is chalk, on every page.** A `.button` that changed
   colour per fixture would make the same control look like four different
   controls. Club colour marks _what this page is about_, not _what to press_.

## The `:root` block

Lives at the top of `src/app/globals.css`. Reproduced here with the parts that
matter; the file is authoritative.

```css
:root {
  --ink: #08090b; /* the ground */
  --slat: #101318; /* panel fill */
  --slat-raised: #171b21; /* a lifted surface: the hero, an armed row */
  --slat-muted: #08090b;
  --rule: #23282f; /* hairline between rows */
  --rule-strong: #333a44; /* an outlined control */
  --chalk: #f4f6f8; /* 18.2:1 — text, and the primary action's fill */
  --muted: #98a1ae; /*  7.2:1 — secondary text */
  --faint: #7f8896; /*  5.1:1 — tertiary text */

  /* Neutral accent defaults. Overridden per page; never set anywhere else. */
  --club: var(--chalk);
  --club-on: var(--ink);
  --club-lit: var(--chalk);

  /* Bottom bands, measured at runtime by useBandHeight (action-bar.tsx).
     First-paint estimates only — never lay out against them as fixed. */
  --nav-h: 4rem;
  --action-h: 0px; /* 0 off a game page: the bar does not exist there */
  --tour-h: 0px;

  --field: #3ddc84; /* settled won  */
  --clay: #ff5a5f; /* settled lost */

  --radius-sm: 0;
  --radius-md: 0; /* nothing is rounded */
}
```

Type is unchanged from the previous two designs: **Archivo Variable** for
display (uppercase, `wdth` 112–118), **IBM Plex Sans** for body, **DM Mono**
for every figure with `tabular-nums`. Eight type steps, four weights, six
spacing steps.

## The club-accent triple

One club colour cannot do every job, so `src/lib/club-accent.ts` derives three
values from `team.colors.primary` in `src/lib/seed.ts`. Seed colours are
canonical data and are **not** edited.

| Token        | What it is                           | Used for                                                        |
| ------------ | ------------------------------------ | --------------------------------------------------------------- |
| `--club`     | the colour as a **surface**          | the painted fixture row, the armed selection, the status ribbon |
| `--club-on`  | text drawn **on** that surface       | everything inside a painted row                                 |
| `--club-lit` | the colour as **text** on the ground | the countdown, block titles, card edges, crest rings            |

Measured against `--ink` (`#08090b`):

| Team        | primary   | as text                              | as a fill                                                   |
| ----------- | --------- | ------------------------------------ | ----------------------------------------------------------- |
| Real Madrid | `#d8c26e` | 11.25:1 ✓                            | ink text, 11.25:1                                           |
| Yankees     | `#a7b4c8` | 9.49:1 ✓                             | fills with the club's navy `#132448`, white text at 15.29:1 |
| Red Sox     | `#d24851` | 4.54:1 ✓                             | ink text, 4.54:1                                            |
| Barcelona   | `#a8274c` | **2.90:1 ✗** → lit `#d64d75`, 4.91:1 | white text, 6.86:1                                          |

`src/lib/club-accent.test.ts` recomputes every ratio for every configured team,
so changing a seed colour fails the suite instead of shipping unreadable text.
It is the same guard the deleted `team-mark.test.tsx` used to provide — and
Barcelona's lit value is the one that component had already derived.

**An edge or a ring is drawn against the ground, so it takes `--club-lit`.**
Only a filled surface carrying text takes `--club` plus `--club-on`. Yankees
navy as a 3px card edge on near-black is invisible; that is the mistake this
rule exists to prevent.

## Where each token may appear

| Token                | Allowed                                                              | Never                             |
| -------------------- | -------------------------------------------------------------------- | --------------------------------- |
| `--club`             | a filled surface with `--club-on` text on it                         | an edge, a rule, a ring, any text |
| `--club-on`          | text and icons inside a `--club` surface                             | anywhere else                     |
| `--club-lit`         | countdowns, block titles, card edges, crest rings, the freshness dot | a large filled area               |
| `--chalk`            | body text, the primary action's fill, focus rings                    | a page ground                     |
| `--field` / `--clay` | a settled outcome                                                    | an open wager, any live clock     |
| `--slat-raised`      | the hero, a hovered row, a floating panel                            | a whole page                      |

## Surfaces

- **`.board-hero`** — `--slat-raised`, the tracked team's crest bled off the
  top-right at `opacity: 0.3` behind the type, a `--club-lit` play-triangle on
  the kicker. Every word over it is a fact already on the board: day,
  competition, both names, venue.
- **`.next-up`** — the reference's card. A `--club-lit` top edge, a centred
  `NEXT MATCH` header split light/bold, crest-V-crest with the tracked side's
  ring in `--club-lit`, the kickoff in mono, the countdown in `--club-lit`, and
  one full-width row that opens the matchup.
- **`.game-row`** — three columns: game, kickoff (mono, right), chevron. One
  line, no meta line: competition and venue live in the hero and on the
  matchup page. Both names share the width and truncate together — the
  ellipsis is on each name, not the line, or the home side eats the row and
  clips the opponent out entirely. The nearest fixture is `.game-row-next`,
  painted `--club` with a chalk inset bar, and its crests get a `--club-on`
  disc so a dark crest does not vanish into a dark fill. **Every descendant of
  a painted row inherits `--club-on`** — hierarchy there is size and weight
  only, because a fixed grey put 4.26:1 text on Yankees navy.
- **`.action-bar`** — a flat band above the nav, on a game page only. Carries
  returns, the stake and its chips, and the place button. Hidden entirely when
  its targets are empty (`:not(:has(.action-bar-action > *))`).
- **`.pitch-art`** — the playing surface as line work, drawn by
  `src/components/pitch-art.tsx`: a pitch for `soccer`, a diamond for
  `baseball`, keyed on the sport so the union stays exhaustive. Flat vector,
  no network, no photography. It sits under `.board-hero-scrim` /
  `.mp-bug-scrim` — a flat 72% `--ink` block, not a gradient — so no
  foreground's contrast depends on it. Layer order inside a hero: art (0),
  crest (1), scrim (2), type (3).
- **`.mp-bug`** — the scorebug keeps its two-sided shape, now over the pitch; each side gets its
  crest beside the name, the tracked side a 4px `--mp-club` stripe taken
  straight from canonical team data, and the countdown `--club-lit`.

## Bottom bands

Three of them, measured rather than assumed, by `useBandHeight` in
`src/components/action-bar.tsx`:

- `--nav-h` — the three-up nav. Always present below 1024px; `display: none`
  reports zero above it.
- `--action-h` — the action bar. Zero off a game page, where it is not
  rendered at all.
- `--tour-h` — the first-run tour bar while it is showing.

`.tour-bar` and `.buddy-launcher` position against the sum of whatever is
actually below them. There is no "raised" variant of the launcher any more —
it reads `--tour-h` directly. Only the bottommost visible band takes safe-area
padding: the nav below 1024px, the action bar above it.

## Full bleed

Below 640px every surface runs edge to edge, as the reference frames do: 32px
of a 390px screen spent on a gutter is 8% of the width given to nothing.

`.main-content` keeps its `1rem` padding so loose text — page headings, filter
chips, the freshness line, fine print — stays inset. The panels cancel it:

```css
@media (max-width: 639px) {
  .board-hero,
  .next-up,
  .panel,
  .metric-card,
  .mp-bug,
  .mp-score {
    margin-inline: -1rem;
    border-inline: 0;
  }
}
```

Net width is unchanged, so nothing overflows the document — which matters,
because `body` carries `overflow-x: hidden` and would hide a real overflow.
The e2e shell test asserts `scrollWidth - innerWidth === 0` across five
viewports and is the guard.
