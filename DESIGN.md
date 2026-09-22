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

- Archivo Variable: interface labels and navigation.
- IBM Plex Sans: body and supporting copy.
- Big Shoulders Display: compact uppercase sports headings and team names.
- DM Mono: times, scores, odds, balances, and tables.

## Components

- Mobile app chrome is fixed above and below a single scrolling workspace.
- Panels use one-pixel cool borders, 10px radii, restrained elevation, and compact padding.
- Acid lime is reserved for the primary action, active navigation, active filters, selected odds, and live emphasis.
- Match imagery is atmospheric background material; all product text and controls remain code-native.
- Team crests use provider imagery with a high-contrast initial mark fallback.

## Responsive Rules

- The reference viewport is 390×844; verify from 360px through 430px wide.
- Mobile content uses 14–16px gutters, 44px minimum touch targets, and safe-area padding.
- Desktop retains the same visual language and existing information, with wider grids rather than enlarged mobile controls.

## Motion

- Use short opacity/translate entry motion only for route content and feedback.
- No continuous decorative motion.
- `prefers-reduced-motion` disables every nonessential animation.
