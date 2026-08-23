import { describe, expect, it } from "vitest";

import { buildFacts, buildSummary } from "@/data/fixture-facts";
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

  it("finds the table row across the vendors' different team names", () => {
    // The stored summary says "Real Madrid CF"; apifootball's table says
    // "Real Madrid".
    const facts = buildFacts({
      ...base,
      homeTeam: "Real Madrid CF",
      awayTeam: "Sevilla FC",
      soccerTable,
    });
    expect(facts.map((fact) => fact.label)).toEqual([
      "Real Madrid CF in the table",
      "Sevilla FC in the table",
    ]);
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
