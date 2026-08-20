import { describe, expect, it } from "vitest";
import { MARK_BACKGROUND, markTextColor } from "@/components/team-mark";
import { teams } from "@/lib/seed";

function relativeLuminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (light! + 0.05) / (dark! + 0.05);
}

describe("team mark colours", () => {
  it.each(teams.map((team) => [team.slug, team.colors.primary] as const))(
    "renders %s initials at AA contrast against the mark background",
    (_slug, primary) => {
      const rendered = markTextColor(primary);
      expect(contrastRatio(rendered, MARK_BACKGROUND)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it("leaves a club colour that already passes unchanged", () => {
    expect(markTextColor("#d8c26e")).toBe("#d8c26e");
  });
});
