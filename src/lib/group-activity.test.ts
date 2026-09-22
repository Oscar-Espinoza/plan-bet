import { describe, expect, it } from "vitest";
import { groupMatchActivity } from "./group-activity";
import { wager } from "../../browser-fixtures/data";

describe("grouped match activity", () => {
  it("combines canonical matches across routes without dropping members or markets, newest first", () => {
    const bets = [
      {
        userId: "a",
        wager: { ...wager, id: "1", placedAt: "2026-09-01T12:00:00.000Z" },
      },
      {
        userId: "b",
        wager: {
          ...wager,
          id: "2",
          routeId: "alternate",
          marketId: "total",
          placedAt: "2026-09-03T12:00:00.000Z",
        },
      },
      {
        userId: "a",
        wager: {
          ...wager,
          id: "3",
          canonicalGameId: "other",
          placedAt: "2026-09-02T12:00:00.000Z",
        },
      },
    ];
    const result = groupMatchActivity(bets, new Map());
    expect(result.map((match) => match.canonicalGameId)).toEqual([
      wager.canonicalGameId,
      "other",
    ]);
    expect(result[0]!.bets.map((bet) => bet.wager.id)).toEqual(["2", "1"]);
    expect(result[0]!.game).toBeUndefined();
    expect(bets[0]!.wager.id).toBe("1");
  });
  it("handles an empty group", () =>
    expect(groupMatchActivity([], new Map())).toEqual([]));
});
