# Slant UI migration

One branch and one PR apply the [token contract](./slant-tokens.md) and the
[board](./slant-board.png) / [matchup](./slant-matchup.png) reference frames.
The reference frames are 390×844 CSS pixels at 2× density. Fixture names,
dates, balances, prices and stake increments are examples. Application data,
markets, house prices, +5 / +25 / max controls, groups and routes remain canonical.
Decorative fixture numbering is deliberately omitted: it has no application meaning.

## Presentation

Concrete surfaces replace the dark ground. Ink wedges carry separate condensed
Archivo team names; a versus divider separates them. The board's Open matchup
link uses the existing fixture route. Freshness information and browser timezone
labels remain visible. DM Mono carries figures. Metadata, icon and social image
use the Slant palette; static Archivo is used by the image renderer.

Plates are sheared boxes with counter-sheared content, never clipped outlines.
All four tile borders remain visible. `Button asChild` keeps the native element
as its slot child. Inputs remain upright; the existing 1px press movement is
composed with the shear. Entry timing, disclosure motion and reduced-motion
behavior remain intact. Necessary control boundaries and selection indicators
use ink tokens; focus rings use ink on concrete and chalk inside ink.
Secondary text on sunk surfaces uses `--ink-soft`. TeamMark, its test and its CSS
are removed. The scorebug retains the canonical club stripe, widened to 4px.

## Ribbon and shell

`AppShell` mounts account, clock, returns, action and feedback areas. A small
client context exposes the mounted targets; wager state and the request handler
remain in `BetSlip`. React owns each portal's lifetime, so unmounting a route
removes its content. Before a target mounts, the action renders inline exactly
once; it moves to the target when ready. The board clock waits for its target.

The board shows the countdown for its displayed next fixture; sport filtering
updates that fixture. Empty boards and matchup pages have no ribbon countdown.
An open matchup initially shows Returns — and a disabled Choose a selection
button. Selection shows the existing rounded return and Place {stake} credits.
The submit button's `form` attribute points at the existing form's generated ID.
Native validation, Enter submission, pending/insufficient-credit disabling,
group choice and API payload remain intact. Errors and confirmation are announced
beside the action. Closed, unavailable and signed-out explanations and sign-in
callback behavior remain available.

Mobile uses three shell rows: workspace, ribbon, navigation. The workspace
scroller ends at the ribbon box, with the diagonal rise reserved inside that
box. Desktop navigation remains in the header; its ribbon is fixed below.
Ribbon height grows with account details, actions and feedback. ResizeObserver
measures ribbon, navigation and tour heights; those values position the tour
and buddy and reserve desktop content clearance. Safe-area padding occurs only
on the bottommost visible band: mobile navigation or desktop ribbon.

## Verification

`browser-fixtures/` is an isolated Vite app using the real components and
production CSS, deterministic demo fixtures, controlled account/wager data,
mocked Next navigation and intercepted API responses. It is served separately
on port 3101, with ordinary page navigation and locators in the existing
Playwright runner. No component-testing dependency or Playwright upgrade.
The fixture suite runs in CI. It checks presentation and client interactions;
existing integration tests remain responsible for server behavior.

Coverage includes unselected/selected wagers, stake changes, exact-score entry,
group choice, pending requests, native invalid input, insufficient credits,
request failures, success, closed states, won/lost/void history, route cleanup,
filter changes, hydration and delayed targets, keyboard focus, press geometry,
all tile borders, and simultaneous ribbon/tour/buddy visibility. Responsive
checks include 320px and 390px phones, short viewports, tablet, desktop, long
account details and reduced motion. Axe runs on interactive fixtures and the
existing eight application routes.

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && \
  pnpm test:integration && pnpm build && pnpm test:e2e && pnpm test:fixtures
```

Compare the board and matchup at 390×844 against the references, allowing the
preserved data and explanatory content to determine height. Refresh
`docs/screenshots/dashboard.png`, `game-detail.png` and `mobile.png` from the
application. Document any validation limitation in the PR rather than treating
unit tests as evidence of browser contrast or server behavior.
