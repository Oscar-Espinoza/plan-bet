# Design System

<!-- impeccable:design-schema 1 -->

## Direction

Matchday Plan uses a night-match visual world: deep navy surfaces, cool structural borders, stadium atmosphere, condensed sports typography, and one acid-lime signal for selected and actionable states. The supplied mobile reference is the production composition target for the home and matchup pages.

## Palette

- Canvas: `#07111a`
- Shell: `#09131d`
- Surface: `#101b26`
- Raised surface: `#14212d`
- Border: `#2a3948`
- Primary text: `#f4f7fb`
- Muted text: `#aeb9ca`
- Accent: `#d7ff34`
- Win/live: `#39e39b`
- Loss: `#ff6075`
- Draw: `#718096`

## Typography

- Archivo Variable (width axis): headings, team names, interface labels and navigation.
- IBM Plex Sans: body and supporting copy.
- DM Mono: times, scores, odds, balances, and tables.
- All three load through `next/font/local` (`src/app/fonts.ts`), latin subset, preloaded.

## Components

- Mobile app chrome is fixed above and below a single scrolling workspace.
- Panels use one-pixel cool borders, 10px radii, and compact padding. No shadows, glows or accent edge bars on cards, rows, chips or buttons, on any page, unless Oscar has asked for or approved that specific one.
- The only approved shadows are on layers that float over the page: the alert dialog, the buddy panel and launcher, and the sticky bet bar.
- Acid lime is reserved for the primary action, active navigation, active filters, selected odds, and live emphasis.
- Match imagery is atmospheric background material; all product text and controls remain code-native.
- Team crests use provider imagery with a high-contrast initial mark fallback.

## Responsive Rules

- The reference viewport is 390×844; verify from 360px through 430px wide.
- Mobile content uses 14–16px gutters, 44px minimum touch targets, and safe-area padding.
- Desktop retains the same visual language and existing information, with wider grids rather than enlarged mobile controls.

## Motion

Motion explains a change the user caused, or softens a change that would otherwise jar. It is never decoration. The values live as tokens in `src/app.css` `:root`. Patterns, hooks and checks are in [docs/design/motion.md](docs/design/motion.md).

- **First paint is static.** On the first load, nothing in the server HTML enters, fades or moves: not the hero, the scorebug, crests, headings, nav or banners. The site's speed is its entrance. Motion starts only after hydration, on a client navigation, a user input, or something the client mounts.
- **One family of curves and a few durations.** `--ease` is for anything that arrives, leaves, settles or is pressed. `--ease-drawer` is only for bars and sheets that come in from a screen edge. Durations come from `--dur-fast`, `--dur-swap`, `--dur-enter`, `--dur-expand` and `--dur-sheet`. No ease-in, no bounce, no springs, and nothing longer than 300ms.
- **How often a thing happens sets its budget.** Navigation and pointer-driven tab/filter swaps have a short outgoing slide and a softer incoming slide. Selection indicators and request state update immediately; keyboard tab/filter changes are instant. Things that mount on their own after load fade in without moving. Dialogs, sheets, the tour bar, docking the bet bar and a placed wager may also travel.
- **Prefer transform and opacity.** User-opened disclosures and pointer-driven internal tab swaps may animate height. Match, account and group panels resize with their incoming content so the footer and any required scroll adjustment follow smoothly; scrollbar space stays reserved. Content that arrives on its own never animates its height or position.
- **Routes hand off once.** Keep the current page visible until the destination's data is ready, then use one short outgoing slide and incoming settle. Do not insert a generic skeleton page or animate a second route entrance when data arrives. Animate the live scrolling content, leaving the header and navigation stationary and clickable throughout, including during rapid second taps. Short-lived, tab-local data caching makes repeat visits immediate; refresh existing fields in place.
- **Tabs retain outgoing content; filters preserve shared surfaces.** Pointer-driven tabs keep the old region through a 110ms exit, then settle the replacement over 220ms. Sport filters keep the photo, hero frame and CTA steady, update changed fields locally, and reposition retained match rows without fading them. Async data replacing a local skeleton keeps its short opacity settle. New content in empty space fades in. Data on screen stays put during a refresh and never collapses back to a skeleton.
- **Confirm in place.** A placed wager confirms on the bar that placed it, rising out of it. Banners settle 4px down into place. They are replaced when the response arrives, never cleared when a submit starts. No corner toasts.
- **Exits are quicker and leave the way they came.** Removed rows and banners go at once.
- **Press.** Discrete controls scale to 0.97, or 0.985 for full-width buttons. Rows and cards in scrolling lists tint instead of scaling. Hover changes colour only, and only on fine pointers.
- **Numbers never perform.** No count-ups, rolling digits, flashes or movement on money. Money never takes the lime, not even for a moment. A balance the user just changed settles in brightness. Figures being typed update instantly.
- **Logic never waits on motion.** Money and request state change at the moment of input. Only the visual unmount waits for an exit.
- **Interruptible.** Anything that can be triggered again picks up from where it currently is.
- No continuous decorative motion. The skeleton pulse and the Buddy caret are functional, and both stop under reduced motion.
- `prefers-reduced-motion` keeps short opacity and colour changes. It drops every translate, scale, slide, height animation and view transition. This is handled rule by rule, never with a global zero-duration override.
- No shadows, glows, blur or accent edges as motion effects.
