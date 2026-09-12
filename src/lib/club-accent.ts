import type { CSSProperties } from "react";

/**
 * The page accent follows the tracked team.
 *
 * One club colour cannot do every job, so each team resolves to three values:
 *
 * - `fill`   — the colour as a *surface* (the crest block, the highlighted
 *              fixture row, the primary action).
 * - `on`     — text drawn on that surface.
 * - `lit`    — the colour used as *text* on the near-black ground, where
 *              `--ink` is `#08090b`.
 *
 * Club colours in `src/lib/seed.ts` are canonical data and stay untouched;
 * this module derives the two values that reading them requires. Barcelona's
 * `#a8274c` is 2.90:1 as text on the ground — below AA even for large type —
 * and lightens to `#d64d75` (4.91:1); that is the same value the old
 * `team-mark.tsx` derived for the same problem before it was deleted.
 *
 * `club-accent.test.ts` recomputes every ratio for every configured team, so a
 * changed club colour fails the suite instead of silently regressing.
 */
export type ClubAccent = { fill: string; on: string; lit: string };

/** The ground these accents are measured against — `--ink` in globals.css. */
export const ACCENT_GROUND = "#08090b";

/** Reversed-out text on a club fill — `--chalk` in globals.css. */
const CHALK = "#f4f6f8";

/**
 * Overrides, keyed on the canonical primary colour.
 *
 * `fill` is only overridden where the primary is too light to read as a block
 * behind reversed text *and* too light to carry ink comfortably: the Yankees'
 * `#a7b4c8` is a silver, so the crest block takes the club's own secondary
 * navy instead. `lit` is only overridden where the primary fails as text.
 */
const OVERRIDES: Record<string, Partial<ClubAccent>> = {
  "#a8274c": { lit: "#d64d75" }, // Barcelona — 2.90:1 as text, 4.91:1 lit
  "#a7b4c8": { fill: "#132448" }, // Yankees — silver reads as a block, navy does not
};

/** Relative luminance, WCAG 2.x. Shared with the test, which re-derives it. */
function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

type Coloured = { colors: { primary: string } };

export function clubAccent(team: Coloured): ClubAccent {
  const primary = team.colors.primary.toLowerCase();
  const override = OVERRIDES[primary] ?? {};
  const fill = override.fill ?? primary;
  return {
    fill,
    // Whichever of ink and chalk reads better on the fill. Both are checked
    // rather than assumed, so a new club colour picks its own side.
    on:
      contrastRatio(ACCENT_GROUND, fill) >= contrastRatio(CHALK, fill)
        ? ACCENT_GROUND
        : CHALK,
    lit: override.lit ?? primary,
  };
}

/**
 * The accent as inline custom properties, for the wrapper a page puts them on.
 * Mirrors the existing `--mp-club` idiom in `matchup/scorebug.tsx`. Rendered
 * on the server, so the club colour is painted on first byte rather than
 * arriving after hydration.
 */
export function clubAccentStyle(team: Coloured | undefined) {
  if (!team) return undefined;
  const accent = clubAccent(team);
  return {
    "--club": accent.fill,
    "--club-on": accent.on,
    "--club-lit": accent.lit,
  } as CSSProperties;
}
