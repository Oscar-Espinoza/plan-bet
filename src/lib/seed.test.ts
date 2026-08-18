import { describe, expect, it } from "vitest";
import {
  allGames,
  generateGames,
  getSnapshot,
  teams,
  validateSeedData,
} from "@/lib/seed";

describe("demo seed data", () => {
  it("validates every team, game, snapshot, and briefing citation", () => {
    const result = validateSeedData();
    expect(result.teams).toHaveLength(4);
    expect(result.games).toHaveLength(20);
    expect(result.snapshots).toHaveLength(20);
  });

  it("generates five future games with stable IDs", () => {
    const now = new Date("2031-04-08T22:30:00.000Z");
    const first = generateGames("barcelona", now);
    const later = generateGames(
      "barcelona",
      new Date("2032-10-12T04:00:00.000Z"),
    );

    expect(first).toHaveLength(5);
    expect(first.every((game) => new Date(game.scheduledAt) > now)).toBe(true);
    expect(first.map((game) => game.id)).toEqual(later.map((game) => game.id));
    expect(first.map((game) => game.scheduledAt)).not.toEqual(
      later.map((game) => game.scheduledAt),
    );
  });

  it("keeps soccer and baseball contexts discriminated", () => {
    const soccer = getSnapshot("soc-rma-01")!;
    const baseball = getSnapshot("mlb-nyy-01")!;

    expect(soccer.context.kind).toBe("soccer");
    expect(baseball.context.kind).toBe("baseball");
    if (soccer.context.kind === "soccer")
      expect(soccer.context.tablePosition).toBeGreaterThan(0);
    if (baseball.context.kind === "baseball")
      expect(baseball.context.probablePitchers).toHaveLength(2);
  });

  it("contains five games for every configured team", () => {
    for (const team of teams) {
      expect(
        allGames.filter((game) => game.teamSlug === team.slug),
      ).toHaveLength(5);
    }
  });
});
