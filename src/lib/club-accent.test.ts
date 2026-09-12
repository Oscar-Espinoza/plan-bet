import { describe, expect, it } from "vitest";
import {
  ACCENT_GROUND,
  clubAccent,
  clubAccentStyle,
  contrastRatio,
} from "@/lib/club-accent";
import { teams } from "@/lib/seed";

/**
 * The guard the deleted `team-mark.test.tsx` used to provide: every configured
 * club colour is re-measured here, so changing one in `seed.ts` fails the suite
 * rather than shipping unreadable text.
 */
describe("club accents", () => {
  it.each(teams.map((team) => [team.slug, team] as const))(
    "%s reads as text on the ground",
    (_slug, team) => {
      const { lit } = clubAccent(team);
      // Countdowns and block titles are large, but the accent also lands on
      // body-sized text, so hold the full AA bar rather than the large-text one.
      expect(contrastRatio(lit, ACCENT_GROUND)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(teams.map((team) => [team.slug, team] as const))(
    "%s carries readable text on its fill",
    (_slug, team) => {
      const { fill, on } = clubAccent(team);
      expect(contrastRatio(on, fill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("leaves a club colour that already passes unchanged", () => {
    expect(clubAccent({ colors: { primary: "#d8c26e" } }).lit).toBe("#d8c26e");
  });

  it("lightens Barcelona's claret, which fails as text at 2.9:1", () => {
    expect(clubAccent({ colors: { primary: "#a8274c" } }).lit).toBe("#d64d75");
  });

  it("emits the three custom properties, and nothing without a team", () => {
    expect(clubAccentStyle(undefined)).toBeUndefined();
    expect(clubAccentStyle({ colors: { primary: "#d8c26e" } })).toEqual({
      "--club": "#d8c26e",
      "--club-on": ACCENT_GROUND,
      "--club-lit": "#d8c26e",
    });
  });
});
