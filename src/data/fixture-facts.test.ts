import { describe, expect, it } from "vitest";

import {
  buildFacts,
  buildSummary,
  withContextFacts,
} from "@/data/fixture-facts";
import { evaluationSnapshots } from "@/lib/__fixtures__/briefing-evals";
import { gameSnapshotSchema } from "@/lib/contracts";
import apiFootballHeadToHead from "@/providers/apifootball/__fixtures__/head-to-head.json";
import apiFootballPredictions from "@/providers/apifootball/__fixtures__/predictions.json";
import apiFootballStandings from "@/providers/apifootball/__fixtures__/standings.json";
import {
  apiFootballHeadToHeadSchema,
  apiFootballPredictionsSchema,
  apiFootballStandingsSchema,
} from "@/providers/apifootball/schemas";
import bigBallsStandings from "@/providers/bigballs/__fixtures__/standings.json";
import { bigBallsStandingsSchema } from "@/providers/bigballs/schemas";

const headToHead = apiFootballHeadToHeadSchema.parse(apiFootballHeadToHead);
const predictions = apiFootballPredictionsSchema.parse(apiFootballPredictions);
const soccerTable = apiFootballStandingsSchema.parse(apiFootballStandings);
const baseballTable = bigBallsStandingsSchema.parse(bigBallsStandings);

const base = {
  canonicalGameId: "football-data-564645",
  sport: "soccer" as const,
  homeTeam: "Elche",
  awayTeam: "Barcelona",
  observedAt: "2026-08-23T12:00:00.000Z",
};

const full = {
  ...base,
  injuries: [
    { team: "Barcelona", player: "Gavi", reason: "Knee Injury" },
    { team: "Barcelona", player: "Ter Stegen", reason: "Back Injury" },
  ],
  prediction: predictions[0],
  meetings: headToHead.meetings,
  homeForm: headToHead.homeForm,
  awayForm: headToHead.awayForm,
  soccerTable,
};

describe("buildFacts", () => {
  it("credits injuries to API-Sports, the only source that carries them", () => {
    const injury = buildFacts(full).find((fact) =>
      fact.id.includes("injuries"),
    );
    expect(injury?.sourceId).toBe("api-sports");
    expect(injury?.value).toContain("Gavi");
  });

  it("never states a percentage or a probability", () => {
    // CLAUDE.md forbids the buddy quoting one, and both prediction feeds are
    // percentage-shaped — the rule is enforced here, at the source, rather
    // than left to the prompt to remember.
    for (const fact of buildFacts(full)) {
      expect(fact.value).not.toMatch(/\d\s*%/);
      expect(fact.value.toLowerCase()).not.toMatch(/percent|probability|odds/);
    }
    const lean = buildFacts(full).find((fact) =>
      fact.id.endsWith("model-lean"),
    );
    expect(lean?.value).toMatch(/leans|too close to call/);
  });

  it("only emits ids a citation marker could resolve", () => {
    // FACT_MARKER in buddy-validation.ts matches [a-zA-Z0-9_-]+ and nothing
    // else, so an id outside that set could never be cited.
    for (const fact of buildFacts(full)) {
      expect(fact.id).toMatch(/^[a-zA-Z0-9_-]+$/);
    }
  });

  it("emits nothing at all when no source answered", () => {
    expect(buildFacts(base)).toEqual([]);
    expect(buildSummary(base, [])).toContain("no additional context");
  });

  it("names one player once however many times the feed reports them", () => {
    // API-Sports carries a row per injury record, so the same name arrives
    // several times for one fixture.
    const facts = buildFacts({
      ...base,
      injuries: [
        { team: "Barcelona", player: "Gavi", reason: "Knee Injury" },
        { team: "Barcelona", player: "Gavi", reason: "Knee Injury" },
        { team: "Barcelona", player: "Ter Stegen", reason: "Back Injury" },
      ],
    });
    expect(facts[0]!.value).toMatch(/^2 out:/);
  });

  it("finds the table row across the vendors' different team names", () => {
    // The stored summary says "Real Madrid CF"; apifootball's table says
    // "Real Madrid".
    const played = soccerTable.map((row) => ({ ...row, played: 20 }));
    const facts = buildFacts({
      ...base,
      homeTeam: "Real Madrid CF",
      awayTeam: "Sevilla FC",
      soccerTable: played,
    });
    expect(facts.map((fact) => fact.label)).toEqual([
      "Real Madrid CF in the table",
      "Sevilla FC in the table",
    ]);
  });

  it("leaves out a standing drawn from a season two matchdays old", () => {
    // The captured table is a real opening-week table: "14th on 0 points from
    // 0 played" reads as a slump when it only means nothing has happened yet.
    expect(soccerTable[0]!.played).toBeLessThan(3);
    expect(
      buildFacts({
        ...base,
        homeTeam: "Real Madrid",
        awayTeam: "Sevilla",
        soccerTable,
      }),
    ).toEqual([]);
  });

  it("reads a baseball record off the standings alone", () => {
    const facts = buildFacts({
      ...base,
      sport: "baseball",
      homeTeam: "New York Yankees",
      awayTeam: "Boston Red Sox",
      baseballTable,
    });
    expect(facts).toHaveLength(2);
    expect(facts[0]!.sourceId).toBe("bigballs");
    expect(facts[0]!.value).toMatch(/run differential [+-]?\d+/);
  });
});

describe("withContextFacts", () => {
  // The real briefing eval snapshot, so the merge is exercised against the same
  // shape the citation-grade pipeline is reviewed against.
  const snapshot = evaluationSnapshots[0]!;

  it("never appends a fact whose source the panel could not list", () => {
    // The invariant that fails if a future buildFacts branch invents a fourth
    // sourceId: the Sources panel would under-report where the material came
    // from, which is the whole reason this merge moved out of the buddy.
    for (const stored of [
      buildFacts(full),
      buildFacts({
        ...base,
        sport: "baseball",
        homeTeam: "New York Yankees",
        awayTeam: "Boston Red Sox",
        baseballTable,
      }),
    ]) {
      const merged = withContextFacts(snapshot, stored);
      const listed = new Set(merged.sources.map((source) => source.id));
      expect(stored.length).toBeGreaterThan(0);
      for (const fact of merged.evidenceFacts) {
        expect(listed).toContain(fact.sourceId);
      }
      // The appended references have to survive the contract too, or the merge
      // would produce a snapshot the read boundary could not have returned.
      expect(() => gameSnapshotSchema.parse(merged)).not.toThrow();
    }
  });

  it("keeps the existing facts in place so their [n] numbers do not move", () => {
    const merged = withContextFacts(snapshot, buildFacts(full));
    expect(
      merged.evidenceFacts.slice(0, snapshot.evidenceFacts.length),
    ).toEqual(snapshot.evidenceFacts);
    expect(merged.sources.slice(0, snapshot.sources.length)).toEqual(
      snapshot.sources,
    );
  });

  it("lists no injury report for a fixture with nobody out", () => {
    const merged = withContextFacts(
      snapshot,
      buildFacts({ ...full, injuries: undefined }),
    );
    expect(merged.sources.map((source) => source.id)).not.toContain(
      "api-sports",
    );
  });

  it("returns the snapshot untouched when nothing was stored", () => {
    expect(withContextFacts(snapshot, [])).toBe(snapshot);
  });

  it("takes the six strongest and stops", () => {
    const stored = Array.from({ length: 9 }, (_, index) => ({
      ...buildFacts(full)[0]!,
      id: `football-data-564645-ctx-${index}`,
    }));
    const merged = withContextFacts(snapshot, stored);
    expect(merged.evidenceFacts).toHaveLength(
      snapshot.evidenceFacts.length + 6,
    );
  });
});
