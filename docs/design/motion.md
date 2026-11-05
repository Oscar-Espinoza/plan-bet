# Matchday Plan motion system

The repo runs @sveltejs/kit 3.1.1 and svelte 5.57.3, not Kit 2. Reference viewport is 390x844. DESIGN.md › Motion is the short form of this document. This is the long form, for people who build and review motion.

## 1. Rules

1. **First paint is static.** On the first document load, nothing in the server HTML enters, fades, moves, or starts below its resting opacity. That includes the home `section.next-up` hero and the game `.mp-bug` scorebug (both are LCP elements), priority crests, headings, nav and SSR banners. The site is fast, and that is its entrance.
2. **Motion runs only after hydration.** It starts on a client navigation, on a user input, or when something mounts on the client that was never in the server HTML.
3. **How often a thing happens sets its budget.** Navigation, tabs, chips, filters, and stake and price taps are instant, or change only opacity or colour, in 150 ms or less. Keyboard changes are instant: arrows, Home/End, and Enter/Space on a tab. Escape is the one keyboard input that still runs an animation, the overlay exit. Elements that mount on their own after hydration fade in and never travel; that covers the account chip, Sign in and the Buddy launcher. Travel is kept for moments the user caused or that happen once: dialogs, the Buddy sheet, the tour bar, docking the bet bar, and a placed wager.
4. **Animate only transform and opacity.** The one layout animation is a disclosure the user opened (block-size, 240 ms or less). Content that arrives without an input never animates height or position. That covers refreshAll, streaming and polling.
5. **One family of curves.** `--ease` is for everything that arrives, leaves, settles or is pressed. `--ease-drawer` is only for bars and sheets that move in from a screen edge. No ease-in, no linear, no bounce, no springs, and nothing longer than 300 ms.
6. **Exits are quicker than entrances and leave the way they came.** Disclosures close in 200 ms and open in 240 ms. Removed rows and banners go at once.
7. **Data never performs.** No count-ups, no rolling digits, no flashes, no transform on a money figure, and no highlight when a background refresh changes data. Money never takes the lime, not even for one frame. Figures the user is typing update instantly.
8. **Logic never waits on motion.** Money and request state (idempotency keys, pending flags, errors) change at the moment of the input. Only the visual unmount waits for an exit timer.
9. **Everything is interruptible.** Anything that can be triggered again is a CSS transition or a WAAPI animation that can be cancelled. A second input continues from the current value.
10. **One moving thing per region, one lead per moment, no stagger.** Elements that animate together start together. A region never fades inside another fade.
11. **Swaps settle, arrivals fade.** Content that replaces other content settles from opacity 0.6, so it can be read on the first frame. That covers a tab panel, a filter result, data replacing its skeleton, and a balance the user just changed. Content that arrives in empty space fades from 0, such as an inserted row or a section that was not there before.
12. **Reduced motion means gentler, not none.** Opacity and colour changes of 120 ms or less stay. Translate, scale, slides, height animation and the view transition go.
13. **No shadows, glows, blur or accent edges as effects.** DESIGN.md and the no-shadow rule override any skill's advice.

## 2. Tokens

These go in the existing `:root` rule of src/app.css, next to `--ease`:

```css
--ease: cubic-bezier(0.23, 1, 0.32, 1); /* existing */
--ease-drawer: cubic-bezier(
  0.32,
  0.72,
  0,
  1
); /* bars and sheets from an edge */
--dur-fast: 120ms; /* press, colour, state, indicators, every reduced-motion fade */
--dur-swap: 150ms; /* route crossfade, swaps, arrivals, dialog exit, label in */
--dur-enter: 200ms; /* banners, dialog entry, chip and launcher fade, balance settle, bar and sheet exit, disclosure close */
--dur-expand: 240ms; /* disclosure open, bar entry, confirmation rise */
--dur-sheet: 280ms; /* Buddy sheet entry */
```

Two fixed values have no token. The pending dim is always opacity 0.6. The outgoing label in a label swap clears in 90 ms.

**How to write durations.** Some rules are copied into the inline `<style>` of a document: those whose selector can match server HTML, those whose classes are in ALWAYS_PRESENT or WHEN_WAGER_PANEL in src/lib/server/critical-css.ts, and every `::view-transition-*` rule. These rules use the literal value with a comment, for example `120ms /* --dur-fast */`. The build strips the comment, so the critical CSS stays small. Rules that only match markup mounted on the client, or classes set by JS, ship in the full sheet after first paint and use `var(--dur-*)`. `var(--ease)` and `var(--ease-drawer)` are fine anywhere.

**JS mirror.** src/lib/components/motion.ts is imported only by route chunks and lazily loaded chunks. Modules that `/` imports statically use literal values instead, so `/` pays no bytes for it.

- `EASE`, `DURATION = { fast: 120, swap: 150, enter: 200, expand: 240, sheet: 280 }` and `reducedMotion()`.
- `fade(nodes, from, ms = 150)` runs a WAAPI opacity animation from `from` to 1 with `id: "mp-fade"`. It cancels its own previous run on each node and caps at 120 ms under reduced motion.
- `afterExit(ms, done)` is a setTimeout (120 ms under reduced motion) and returns a cancel function.
- `arrive(nodes, since, from = 0)` calls `fade` only if `performance.now() - since >= 50`, which means a skeleton or a gap was actually painted.
- `fadeAdded(root, update, selector)` records the elements under `root` that match `selector`, awaits `update()` and `tick()`, then fades only the outermost newly added matches, from 0.

## 3. Shipping rules (performance contract)

- **No libraries.** No svelte/transition, svelte/animate, svelte/motion or svelte/easing, and no new library. The Svelte transition runtime would land in the shared chunk that `/` loads: about 1.5 KB gzip, against 683 B of headroom.
- **Hidden states live only in `@starting-style` or in WAAPI keyframes.** Never write a resting `opacity: 0` that JS later lifts.
- **`@starting-style` fires whenever an element has no previous style.** That happens at first paint for server HTML, when `{#if}` or `{#key}` re-creates an element, and for every descendant of an element leaving `display: none` (tab panels toggled with `hidden`). Use it only on client-only surfaces that never re-mount without an input: `[open]` dialogs, the tour bar, the bet bar, the confirmation card, the topbar controls' children, the launcher, Buddy turns behind a live gate, and `.enter`. Swaps and "arrived once" fades use `fade` and `arrive`. Those are one-shot WAAPI animations started from a handler or from a holder's first resolve, so a tab return, a display change or a 60 s refresh cannot replay them.
- **Name gate classes plainly.** CSS motion hooks are `tour-bar-leaving`, `bet-bar-leaving`, `buddy-panel-live`, `buddy-launcher-enter`, `buddy-launcher-slot`, `bet-slip`, `label-swap`, `stale-area`, `locale-pending` and `banner-static`. The pruner drops them from inline CSS unless the server renders them. Never use `is-*` or a `-active`, `-open`, `-selected` or `-current` suffix for a motion hook, because the pruner inlines those everywhere.
- **Lazy mounts that carry an entry wait for `fullCssReady()`**, the same pattern the navigation preview uses.
- **Exits use a state hook and a timer.** Set a state hook (a `-leaving` class or `data-closing`), let the CSS transition run, and unmount after `afterExit()`. Never wait on `transitionend`. Cancel the timer on every other close path and on teardown.
- **View transitions.** Keep exactly one `startViewTransition`, in +layout.svelte's onNavigate. Add no awaited work. Add no `view-transition-name` and no cross-document `@view-transition`. Skip the transition for navigations that keep the same pathname, and for a popstate the browser has already animated. Keep `::view-transition-*` rules inside the existing no-preference block.
- **Reduced motion.** Keep the global block, which limits transition-property to opacity and colours at 120 ms. Anything that holds a transform at rest joins the `transform: none !important` list: an `:active` scale, a leaving bar, a closing sheet. A surface that slides without fading gets an opacity start that applies only under reduced motion. Never use a global 0.01 ms override.
- **Edit the existing CSS rule for a selector instead of appending an override** (project rule). New state selectors (`:active`, `[data-closing]`, `-leaving`, `@starting-style`) sit next to their base rule. A new compound scoped to the client, such as `.bet-slip .bet-bar`, is a new selector, not an override.
- **Bytes.** Production gzip today: home document 11,987 B and game document 13,386 B, both of which must stay under 14,000 B. `/` first-load JS is 60,757 of 61,440 B, which leaves 683 B. `/games/[id]` is 73,083 of 81,920 B. The budget is split like this:

| Ticket      | Home doc | Game doc | `/` JS              | Game JS        |
| ----------- | -------- | -------- | ------------------- | -------------- |
| M1          | ≤ +220   | ≤ +210   | +0                  | +0             |
| M2          | ≤ +10    | ≤ +10    | ≤ +400              | ≤ +400         |
| M3          | 0        | ≤ +90    | 0                   | ≤ +1,000       |
| M4          | ≤ +20    | 0        | ≤ +150              | 0              |
| M5 combined | ≤ +250   | ≤ +300   | ≤ +683 (target 550) | ≤ 81,920 total |

## 4. Patterns

**P1. Route enter (client navigation)**

- **Crossfade.** `::view-transition-old(root), ::view-transition-new(root) { animation-duration: 150ms; animation-timing-function: var(--ease) }`, keeping the UA fade keyframes and plus-lighter. Add `::view-transition { pointer-events: none }` so a second quick tap reaches the live new page while the old image fades.
  - Tool: the View Transitions API. It is the only compositor crossfade between two DOM trees, and it is already wired.
- **Skipped** when the pathname is the same: query-only updates such as a current-tab tap, history paging, `?pick` or `?section`. Also skipped for a popstate with `hasUAVisualTransition` (iOS edge swipe, Android predictive back).
- **Preview.** The skeleton shows only if the navigation is still pending 100 ms after the tap. It then enters with the existing `navigation-enter` (opacity 0.75 to 1, 120 ms, `--ease`). Fast navigations crossfade page to page with no skeleton frame. The old route stays visible, inert, until the skeleton can paint. The skeleton copies the destination's layout (`.page-heading`, the /you lead block, a home silhouette) so the crossfade resolves in place.
- **Chrome.** The mobile-nav indicator moves at the tap, which is the instant feedback. The back arrow, the brand-name collapse, the tour bar and the launcher follow the screen that is visible: the skeleton's route once it shows, otherwise the committed route. So they change inside the crossfade.
- **Interruption.** A new navigation skips the running transition.
- **Reduced motion.** No view transition, and the preview gets `animation: none`. Layout parity still prevents the jump.

**P2. Skeleton to content**

- **Holders keep the last resolved value**, so a refresh never falls back to the skeleton. On the first resolve, `arrive(regions, mountedAt, 0.6)` runs a 150 ms settle, but only if the skeleton was painted (50 ms or more since mount). A promise that is already resolved when the holder remounts, such as on a tab return, shows at once.
- **Arrival into empty space**, such as the game discussion: `arrive(node, mountedAt, 0)`.
- **A reload the user started** (history page or filter) dims the old list: `.stale-area[aria-busy="true"] { opacity: 0.6 }` in 120 ms, restoring in 150 ms. Background refreshes swap in place with no motion.
- **Tool:** WAAPI through motion.ts. It is one-shot by construction, whereas `@starting-style` would replay on a tab return.
- **Reduced motion:** the same fades at 120 ms.

**P3. Tabs**

- **Panel.** On a pointer switch only (`event.detail > 0`), call `fade(panel, 0.6)` (150 ms) after the DOM update. The outgoing panel hides at once. Switches made by keyboard, Enter/Space or the URL are instant.
- **Indicator.** Crossfades in place and never slides. Opacity and colour change over 120 ms on the mobile-nav `::before`, the `.mp-tabs` `::after` and the section and group tab border colour.
- **Label width** is reserved with a hidden bold copy (`content: attr(data-label) / ""`), so a change of selection never moves the neighbouring tabs.
- **Tool:** WAAPI for the panel, CSS for the indicator.
- **Reduced motion:** 120 ms.

**P4. Lists and filters**

- **Inserts the user caused** (Show all, a new invite row): `fadeAdded` fades the new rows from 0 in 150 ms. Rows that existed before the action never animate, and neither do rows added by a background refresh.
- **Removals are instant.** Siblings close up at once. No FLIP and no stagger.
- **Board filter.** The chip handler swaps the state, then calls `fade` from 0.6 on the board's result regions: `.live-section`, `.slate-groups`, the empty-state `.panel` and `.slate-freshness`. The hero text (`.next-up-header`, `.next-up-teams`, `.next-up-detail`) fades too, but only when the next match changed. The hero frame, the stadium image and the CTA stay still. Rows are not re-keyed: the keyed each blocks update in place, so the tap stays cheap.
- **Tool:** WAAPI started from the handler, so nothing sticky is left for a refresh to trigger.
- **Reduced motion:** 120 ms.

**P5. Disclosure**

- **Values.** Opening animates block-size from 0 to auto over 240 ms with `--ease`, plus opacity over 150 ms. Closing takes 200 ms and 150 ms. This relies on `interpolate-size: allow-keywords` on :root.
- **Where.** `details::details-content` (existing) and `.discussion-replies[hidden]`, using display allow-discrete. On the replies block the bottom margin animates with the height, so nothing jumps at the end.
- **Tool:** CSS. This is the one sanctioned layout animation: triggered by an input and finished within 500 ms. Safari and Firefox snap the height and still fade.
- **Interruption:** the transitions retarget mid-toggle.
- **Reduced motion:** a 120 ms fade, and the height snaps.

**P6. Overlays and edge surfaces**

- **Dialog** (`dialog.alert-content`, centred).
  - Entry: from opacity 0 and `translate(-50%, -50%) scale(0.96)` to rest, over 200 ms with `--ease`. The backdrop fades over 200 ms.
  - Exit: `data-closing` sets opacity 0 and scale(0.98) over 150 ms, then `dialog.close()` runs after `afterExit(150)`. Escape goes through the same path via `cancel` and preventDefault.
  - Keep the centring translate inside every transform value. Never use the standalone `scale` property.
- **Buddy sheet** (`dialog.buddy-panel`).
  - It slides and does not fade: in from `translateY(100%)` over 280 ms with `--ease-drawer`, using `translateX(100%)` at 1024 px and up.
  - It exits back to the same edge in 200 ms. The backdrop fades in over 200 ms and out over 150 ms.
  - `:not([open]) { display: none }` is required.
- **Bars** (`.tour-bar`, `.bet-bar`).
  - Entry: from `translateY(100%)` and opacity 0, transform over 240 ms with `--ease-drawer` and opacity over 150 ms with `--ease`.
  - Exit (`-leaving`): transform over 200 ms with `--ease-drawer` and opacity over 200 ms with `--ease`, back down, then unmount.
  - Re-arming during the exit cancels it, and the bar rises from where it is.
  - The tour bar rises from behind the mobile nav. The nav needs `position: relative` for its z-index to apply.
- **Chrome that mounts after hydration** (account chip or Sign in, Buddy launcher): opacity 0 to 1 over 200 ms, no travel, mounted only after `fullCssReady()`.
- **Tool:** `@starting-style`, CSS transitions and `afterExit` timers. Exits then work without `overlay` support and without Svelte's runtime.
- **Reduced motion:** entries and exits become 120 ms fades. The leaving and closing transforms are forced to none, and the sheet gets an opacity start that applies only under reduced motion.

**P7. Feedback**

- **Banners** settle 4 px down into place over 200 ms (the existing `@starting-style`), never at first paint (`.banner-static`). Inside the bet bar they fade only, because the bar itself grows upward. No exit and no height motion.
- **Messages** are replaced or cleared when the response settles, never when a submit starts. Each settled response re-keys the banner (`{#key attempt}`), so an identical repeated failure replays the entry.
- **The wager confirmation rises out of its bar.** `.bet-confirmation` goes from opacity 0 and `translateY(6px) scale(0.98)` to rest, with the origin at bottom centre: opacity over 200 ms, transform over 240 ms. The banner inside it does not run its own entry.
- No toasts, no lime, no glow, no bounce.
- **Reduced motion:** opacity over 120 ms.

**P8. Press**

- **Discrete controls scale.** `.button`, `.slate-chip`, `.stake-chips button` and `.market-filters button` scale to 0.97, and `.button.w-full` to 0.985. The mobile-nav icon and the back-arrow icon scale to 0.94. Transform runs over 120 ms with `--ease` on press and release.
- **Targets that tile a scrolling region tint and never scale:** game rows, group cards, flat rows and settings rows. `:active` gives them an instant `--slat-raised` background, because a scroll that starts on them must not move them.
- **Price cards get no press motion.** The armed fill on tap is the feedback.
- **Hover** changes colour only, inside `@media (hover: hover) and (pointer: fine)`.
- **Tap highlight.** Set `-webkit-tap-highlight-color: transparent` on every control that has its own press feedback. Add one passive no-op `touchstart` listener on document, lazily after hydration, so iOS applies `:active`.
- **`.button:disabled`** transitions its opacity over 120 ms.
- **Tool:** CSS pseudo-classes, because handlers only attach after kit.start.
- **Reduced motion:** no scale; the tints stay.

**P9. Images and crests**

- No fades. Crests and the hero sit static in sized boxes. A fade for lazy crests below the fold is deferred.

**P10. Number change**

- **Values.** When the user's own placement or reset changes the topbar balance, call `fade(span, 0.6, 200)`. It is a brightness settle with no transform and no colour.
- **Not animated:** hydration, server refreshes, settlements, and figures being typed.
- **Owner feel-check item.**
- **Tool:** WAAPI.
- **Reduced motion:** 120 ms.

**P11. Label swap**

- **Values.** `.label-swap { display: inline-grid }` with `> * { grid-area: 1 / 1 }` reserves the width of the wider label. The inactive label is `aria-hidden="true"` at opacity 0. The incoming label fades in over 150 ms and the outgoing one clears in 90 ms, so the two never ghost over each other. Copy changes to Copied and reverts after 2000 ms.
- **Not used on the floating launcher**, where it would pad the button permanently.
- **Reduced motion:** 120 ms.

**P12. Pending**

- **Locale switch:** `html.locale-pending .main-content` dims to 0.6 in 120 ms and restores in 150 ms. That is the same dim as `.stale-area`.
- **Reduced motion:** kept, because it shows state rather than motion.

**P13. Scroll**

- No global `scroll-behavior: smooth`. Navigation resets and restores, hash jumps, the `#invite` arrival and the Buddy transcript all scroll instantly. In the transcript, the 150 ms turn entry is the motion.

## 5. Choreography: the wager flow (the one signature moment)

| t (ms)  | Arm (first price tap)                                                                                                          | Place, success                                                                                                         | Done                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 0       | Price fill (instant). Bet bar rises (lead: transform 240 drawer, opacity 150). Side form `.enter` settles 4 px (support, 200). | Confirmation rises from the bar (lead, 240). Topbar balance settles (support, opacity 200). Tour copy swaps instantly. | Idempotency key cleared at once. Bar and card sink together (200). |
| 200–240 | Settled                                                                                                                        | Settled                                                                                                                | Slip state resets and the bar unmounts at 200.                     |

If the user re-arms during Done, the card goes at once, the bar reverses from where it is, and the next Place gets a new key. The confirmation keeps focus (`focus({ preventScroll: true })`).

One pop is known and accepted: when Skip removes the tour bar, `--tour-h` drops and the bet bar snaps down. It is rare, and fixing it would need a layout animation.

## 6. Never

- An entrance on the LCP hero or scorebug, or on crests, headings or nav at load.
- Scroll reveals, card hover lift, continuous loops (beyond the existing skeleton pulse and Buddy caret), shimmer, pulsing live dots, rolling countdown digits.
- Count-ups, odds or price flashes, transforms on money, highlights on background refreshes.
- Directional or sliding route transitions, named chrome, cross-document view transitions.
- `transition: all`, animated blur, `backdrop-filter`, box-shadow motion, transitions on font properties.
- Svelte transition, animate, motion or easing imports, or any new animation library.
- Logic (keys, pending, errors) gated on an animation timer.

## 7. Verification protocol (every ticket)

- **Where to run.** Interaction checks (frames, behaviour, reduced motion, video) run on a local Worker built like production: `pnpm build && npx wrangler dev --env preview --port 870N`, with N = 1 to 5 for M1 to M5, so tickets running in parallel never collide.
  - Bytes and Lighthouse run on the one preview Worker (`pnpm deploy:preview`, https://matchday-preview.jolyyjhon.workers.dev), and only while the ticket holds the coordinator's measurement lock. The lock goes in order: M1, M2, M3, M4, M5.
  - With the lock held: deploy the base (cf/main for M1 and M5, the M1 branch for M2 to M4), measure "before", deploy the ticket, measure "after", release the lock.
- **V1 static.** `pnpm check` prints CHECK OK, and `node scripts/budget.mjs` prints no BUDGET WARN. Report the exact first-load gzip figures for `/` and `/games/[id]` against the base.
- **V2 document bytes.** Run `curl -s -H 'accept-encoding: gzip' <url> | wc -c` on `/` and `/games/football-data-575386-real-madrid`. Both must be under 14,000 B. Report the delta against the base and against the §3 allocation.
- **V3 Lighthouse.** Five runs per page and variant, medians, in the same session: `npx -y lighthouse@12 '<url>?<ticket>=before|after' --chrome-path=/usr/bin/google-chrome --chrome-flags='--headless=new --no-sandbox' --only-categories=performance --form-factor=mobile`.
  - Pages: `/` and `/games/football-data-575386-real-madrid` (finished). When the slip is touched, also `/games/football-data-564741-real-madrid` (upcoming; if it has started, use the nearest upcoming game).
  - Pass: FCP 0.82 s or less; LCP no more than the same-session base + 0.05 s (production 1.30 s home, 1.22 s game); CLS 0.002 or less, with the game culprit `.mp-side` unchanged; TBT 10 ms or less; no NO_LCP; the `non-composited-animations` audit lists 0 items; the LCP element is still `SECTION.next-up` or `.mp-bug`.
- **V4 gate integrity** (unthrottled trace). A first-contentful-paint entry exists. The `start` import and the full-sheet preload begin after it. The woff2 requests begin after the first LCP entry.
- **V5 critical-CSS hold test** (T13d method: CDP pauses the .css request, viewport 390x844). At the first paint:
  - (a) No element's computed opacity is lower than in the base build's paused snapshot of the same page. The `.mp-bug-scrim` at 0.72 and the loading pulse are part of that baseline.
  - (b) `document.getAnimations()` contains nothing except the existing loading-pulse.
  - (c) The LCP region (`section.next-up`, `.mp-bug`) matches the same build's settled frame: 0 px with a luminance delta of 8 or more. `.mp-tabs` may differ by up to 4 px.
  - (d) Grep the inline `<style>` and list every new selector that was inlined. The ticket's client-only hooks must be absent.
- **V6 frames.** Use Chrome DevTools Performance or chrome-devtools MCP traces at 390x844, with 4x CPU throttling and again at 6x. Add an in-page rAF delta sampler and a `long-animation-frame` observer.
  - Pass: 0 dropped frames at 1x; at most 1 dropped frame per animation at 4x; no long animation frame over 50 ms overlapping an animation; Paint flashing shows no repaint during transform or opacity motion (disclosures exempt).
  - Use a real mid-range Android over remote debugging when one is available. Test iOS Safari on a device when one is available, and report it when not.
- **V7 reduced motion** (DevTools emulation). No translate or scale anywhere. Every remaining fade is 120 ms or less. `document.startViewTransition` is never called (check with a logpoint). No keyframe animation runs except opacity of 120 ms or less. Disclosures open with no height animation.
- **V8 video.** Screen recordings at 390x844 of each listed moment, at 1x and at 25% (DevTools Animations panel), plus a before/after filmstrip of each measured page's load. Attach them to the report.
- **V9 review.**
  - Every change edits the existing CSS rule for its selector; nothing is appended as an override.
  - No new dependency, and no svelte/transition, animate, motion or easing import.
  - motion.ts is not imported by any module that `/` loads statically.
  - No shadow, glow, blur or lime is added, and money is untouched by motion.
