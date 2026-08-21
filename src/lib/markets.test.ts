import { describe, expect, it } from "vitest";
import {
  gameSummarySchema,
  type GameResult,
  type GameSummary,
} from "@/lib/contracts";
import {
  gradeSelection,
  marketsFor,
  resolveSelection,
  type Market,
} from "@/lib/markets";

function makeResult(
  homeScore: number,
  awayScore: number,
  completion?: GameResult["completion"],
): GameResult {
  return {
    homeScore,
    awayScore,
    completion,
    source: "test-fixture",
    observedAt: "2026-08-20T22:00:00.000Z",
  };
}

function makeGame(overrides: Partial<GameSummary> = {}): GameSummary {
  return gameSummarySchema.parse({
    id: "test-game",
    sport: "soccer",
    teamSlug: "real-madrid",
    competition: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    scheduledAt: "2026-08-20T20:00:00.000Z",
    status: "finished",
    ...overrides,
  });
}

function makeBaseballGame(overrides: Partial<GameSummary> = {}): GameSummary {
  return makeGame({
    sport: "baseball",
    teamSlug: "new-york-yankees",
    competition: "MLB",
    homeTeam: "New York Yankees",
    awayTeam: "Boston Red Sox",
    ...overrides,
  });
}

function findMarket(
  sport: "soccer" | "baseball",
  kind: Market["kind"],
): Market {
  const market = marketsFor(sport).find((m) => m.kind === kind);
  if (!market) throw new Error(`no ${kind} market for ${sport}`);
  return market;
}

describe("marketsFor catalogue invariants", () => {
  it("every price is greater than 1.0", () => {
    for (const sport of ["soccer", "baseball"] as const) {
      for (const market of marketsFor(sport)) {
        for (const selection of market.selections) {
          expect(selection.price).toBeGreaterThan(1.0);
        }
      }
    }
  });

  it("selection ids are unique within each market", () => {
    for (const sport of ["soccer", "baseball"] as const) {
      for (const market of marketsFor(sport)) {
        const ids = market.selections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("market ids are unique within each sport", () => {
    for (const sport of ["soccer", "baseball"] as const) {
      const ids = marketsFor(sport).map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  // gradeSelection reads `market.line!` with no runtime guard, so a total
  // market shipped without a line would silently compare against undefined and
  // grade every stake as "under". The catalogue is static, so this catches it
  // at build time instead of costing an unreachable branch at runtime.
  it("every total market has a line, and it ends in .5 so a push cannot arise", () => {
    for (const sport of ["soccer", "baseball"] as const) {
      for (const market of marketsFor(sport)) {
        if (market.kind !== "total") continue;
        expect(market.line).toBeTypeOf("number");
        expect(market.line! % 1).toBe(0.5);
      }
    }
  });

  it("baseball offers exactly 2 markets, soccer offers 4", () => {
    expect(marketsFor("baseball")).toHaveLength(2);
    expect(marketsFor("soccer")).toHaveLength(4);
  });
});

describe("gradeSelection - match_result", () => {
  it("soccer: home win grades home won, draw/away lost", () => {
    const market = findMarket("soccer", "match_result");
    const game = makeGame({ result: makeResult(2, 0, "regulation") });
    expect(gradeSelection(market, "home", game)).toBe("won");
    expect(gradeSelection(market, "draw", game)).toBe("lost");
    expect(gradeSelection(market, "away", game)).toBe("lost");
  });

  it("soccer: draw grades draw won, home/away lost", () => {
    const market = findMarket("soccer", "match_result");
    const game = makeGame({ result: makeResult(1, 1, "regulation") });
    expect(gradeSelection(market, "draw", game)).toBe("won");
    expect(gradeSelection(market, "home", game)).toBe("lost");
    expect(gradeSelection(market, "away", game)).toBe("lost");
  });

  it("soccer: away win grades away won, home/draw lost", () => {
    const market = findMarket("soccer", "match_result");
    const game = makeGame({ result: makeResult(0, 3, "regulation") });
    expect(gradeSelection(market, "away", game)).toBe("won");
    expect(gradeSelection(market, "home", game)).toBe("lost");
    expect(gradeSelection(market, "draw", game)).toBe("lost");
  });

  it("baseball: home win grades home won, away lost (no draw selection)", () => {
    const market = findMarket("baseball", "match_result");
    const game = makeBaseballGame({ result: makeResult(5, 3) });
    expect(gradeSelection(market, "home", game)).toBe("won");
    expect(gradeSelection(market, "away", game)).toBe("lost");
  });

  it("baseball: away win grades away won, home lost", () => {
    const market = findMarket("baseball", "match_result");
    const game = makeBaseballGame({ result: makeResult(2, 6) });
    expect(gradeSelection(market, "away", game)).toBe("won");
    expect(gradeSelection(market, "home", game)).toBe("lost");
  });

  it("baseball: an equal score (which MLB does not produce) voids every selection", () => {
    const market = findMarket("baseball", "match_result");
    const game = makeBaseballGame({ result: makeResult(4, 4) });
    expect(gradeSelection(market, "home", game)).toBe("void");
    expect(gradeSelection(market, "away", game)).toBe("void");
  });
});

describe("gradeSelection - total", () => {
  it("soccer 2.5 line: over wins above the line, under loses", () => {
    const market = findMarket("soccer", "total");
    const game = makeGame({ result: makeResult(2, 1, "regulation") }); // total 3
    expect(gradeSelection(market, "over", game)).toBe("won");
    expect(gradeSelection(market, "under", game)).toBe("lost");
  });

  it("soccer 2.5 line: under wins below the line, over loses", () => {
    const market = findMarket("soccer", "total");
    const game = makeGame({ result: makeResult(1, 0, "regulation") }); // total 1
    expect(gradeSelection(market, "under", game)).toBe("won");
    expect(gradeSelection(market, "over", game)).toBe("lost");
  });

  it("baseball 8.5 line: over wins above the line, under loses", () => {
    const market = findMarket("baseball", "total");
    const game = makeBaseballGame({ result: makeResult(6, 4) }); // total 10
    expect(gradeSelection(market, "over", game)).toBe("won");
    expect(gradeSelection(market, "under", game)).toBe("lost");
  });

  it("baseball 8.5 line: under wins below the line, over loses", () => {
    const market = findMarket("baseball", "total");
    const game = makeBaseballGame({ result: makeResult(3, 2) }); // total 5
    expect(gradeSelection(market, "under", game)).toBe("won");
    expect(gradeSelection(market, "over", game)).toBe("lost");
  });
});

describe("gradeSelection - both_teams_to_score", () => {
  it("grades yes won when both teams score", () => {
    const market = findMarket("soccer", "both_teams_to_score");
    const game = makeGame({ result: makeResult(2, 1, "regulation") });
    expect(gradeSelection(market, "yes", game)).toBe("won");
    expect(gradeSelection(market, "no", game)).toBe("lost");
  });

  it("grades no won on a 0-0 (neither team scored)", () => {
    const market = findMarket("soccer", "both_teams_to_score");
    const game = makeGame({ result: makeResult(0, 0, "regulation") });
    expect(gradeSelection(market, "no", game)).toBe("won");
    expect(gradeSelection(market, "yes", game)).toBe("lost");
  });

  it("grades no won when only one team scores", () => {
    const market = findMarket("soccer", "both_teams_to_score");
    const game = makeGame({ result: makeResult(3, 0, "regulation") });
    expect(gradeSelection(market, "no", game)).toBe("won");
    expect(gradeSelection(market, "yes", game)).toBe("lost");
  });
});

describe("gradeSelection - exact_score", () => {
  it("grades the matching scoreline won and every other grid selection lost", () => {
    const market = findMarket("soccer", "exact_score");
    const game = makeGame({ result: makeResult(2, 1, "regulation") });
    expect(gradeSelection(market, "2-1", game)).toBe("won");
    expect(gradeSelection(market, "1-1", game)).toBe("lost");
    expect(gradeSelection(market, "0-0", game)).toBe("lost");
  });

  it("a scoreline outside the 0-3 grid loses every exact-score selection", () => {
    const market = findMarket("soccer", "exact_score");
    const game = makeGame({ result: makeResult(5, 4, "regulation") });
    for (const selection of market.selections) {
      expect(gradeSelection(market, selection.id, game)).toBe("lost");
    }
  });
});

describe("gradeSelection - void conditions", () => {
  it("voids when result is missing", () => {
    const market = findMarket("soccer", "match_result");
    const game = makeGame({ status: "scheduled" });
    expect(gradeSelection(market, "home", game)).toBe("void");
  });

  it("voids a cancelled game even with a result present", () => {
    const market = findMarket("soccer", "match_result");
    const game = makeGame({
      status: "cancelled",
      result: makeResult(1, 0, "regulation"),
    });
    expect(gradeSelection(market, "home", game)).toBe("void");
  });

  it("voids a postponed game even with a result present", () => {
    const market = findMarket("baseball", "match_result");
    const game = makeBaseballGame({
      status: "postponed",
      result: makeResult(4, 2),
    });
    expect(gradeSelection(market, "home", game)).toBe("void");
  });

  it("voids every soccer market when completion is extra time", () => {
    const game = makeGame({ result: makeResult(2, 1, "extra") });
    for (const market of marketsFor("soccer")) {
      const firstSelection = market.selections[0]!;
      expect(gradeSelection(market, firstSelection.id, game)).toBe("void");
    }
  });

  it("voids every soccer market when completion is a shootout", () => {
    const game = makeGame({ result: makeResult(1, 1, "shootout") });
    for (const market of marketsFor("soccer")) {
      const firstSelection = market.selections[0]!;
      expect(gradeSelection(market, firstSelection.id, game)).toBe("void");
    }
  });

  it("does NOT void baseball when completion is absent (the MLB feed never reports it)", () => {
    const market = findMarket("baseball", "match_result");
    const game = makeBaseballGame({ result: makeResult(3, 1) });
    expect(game.result?.completion).toBeUndefined();
    expect(gradeSelection(market, "home", game)).toBe("won");
  });
});

describe("resolveSelection", () => {
  it("resolves every catalogue market and selection for both sports", () => {
    for (const sport of ["soccer", "baseball"] as const) {
      for (const market of marketsFor(sport)) {
        for (const selection of market.selections) {
          const resolved = resolveSelection(sport, market.id, selection.id);
          expect(resolved).toEqual({ market, selection });
        }
      }
    }
  });

  it("returns undefined for an unknown market", () => {
    expect(
      resolveSelection("soccer", "not-a-real-market", "home"),
    ).toBeUndefined();
  });

  it("returns undefined for a known market with an unknown selection", () => {
    expect(
      resolveSelection("soccer", "soccer-match-result", "not-a-real-selection"),
    ).toBeUndefined();
  });

  it("does not resolve a selection id under the wrong sport's market id", () => {
    expect(
      resolveSelection("baseball", "soccer-match-result", "home"),
    ).toBeUndefined();
  });
});

describe("gradeSelection - unknown selection", () => {
  it("throws for a selection id that does not exist on the market", () => {
    const market = findMarket("soccer", "match_result");
    const game = makeGame({ result: makeResult(1, 0, "regulation") });
    expect(() => gradeSelection(market, "not-a-real-id", game)).toThrow();
  });
});
