import { describe, expect, it } from "vitest";
import { buildMatchView } from "@/lib/game-view";
import { allGames, getSnapshot, getTeam } from "@/lib/seed";
import type { EvidenceFact, GameSnapshot } from "@/lib/contracts";

const soccerBase = getSnapshot(
  allGames.find((game) => game.sport === "soccer")!.id,
)!;
const baseballBase = getSnapshot(
  allGames.find((game) => game.sport === "baseball")!.id,
)!;

function withFacts(snapshot: GameSnapshot, extra: EvidenceFact[]) {
  return { ...snapshot, evidenceFacts: [...snapshot.evidenceFacts, ...extra] };
}

function fact(label: string, value: string): EvidenceFact {
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    value,
    valueType: "text",
    sourceId: "test",
    observedAt: "2026-08-30T00:00:00.000Z",
  };
}

function find(blocks: ReturnType<typeof buildMatchView>["blocks"], id: string) {
  return blocks.find((block) => block.id === id);
}

describe("buildMatchView", () => {
  it("merges the opponent's enrichment facts against the tracked team's context", () => {
    const team = getTeam(soccerBase.game.teamSlug)!;
    const { homeTeam, awayTeam } = soccerBase.game;
    const opponent =
      soccerBase.game.homeTeamSlug === team.slug ? awayTeam : homeTeam;
    const view = buildMatchView(
      withFacts(soccerBase, [
        fact(`${opponent} recent form`, "LWWDW (most recent first)"),
        fact(
          `${opponent} in the table`,
          "4 of the league on 51 points from 28 played, 44-26 on goals",
        ),
      ]),
      team,
    );

    const trackedSide = view.identity.trackedSide;
    const otherSide = trackedSide === "home" ? "away" : "home";

    const form = find(view.blocks, "form")!.rows[0]!;
    expect(form[otherSide]).toBe("LWWDW");
    expect(form[trackedSide]).toBeTruthy();

    const table = find(view.blocks, "table")!;
    expect(table.rows.find((r) => r.label === "Position")?.[otherSide]).toBe(
      "#4",
    );
    expect(table.rows.find((r) => r.label === "Points")?.[otherSide]).toBe(
      "51",
    );
    expect(table.rows.find((r) => r.label === "Goals")?.[otherSide]).toBe(
      "44-26",
    );
  });

  it("keeps an unparseable table sentence as prose instead of dropping it", () => {
    const team = getTeam(soccerBase.game.teamSlug)!;
    const view = buildMatchView(
      withFacts(soccerBase, [
        fact(`${soccerBase.game.awayTeam} in the table`, "somewhere mid-table"),
      ]),
      team,
    );
    expect(
      find(view.blocks, "table")!.rows.some(
        (r) => r.note === "somewhere mid-table",
      ),
    ).toBe(true);
  });

  it("hangs the platoon split off the opposing pitcher, not its own block", () => {
    const team = getTeam(baseballBase.game.teamSlug)!;
    const context = baseballBase.context;
    if (context.kind !== "baseball")
      throw new Error("expected baseball context");
    const snapshot: GameSnapshot = {
      ...baseballBase,
      context: {
        ...context,
        splits: { vsLeft: ".251", vsRight: ".274" },
        probablePitchers: [
          { team: team.name, name: "Home Arm", throws: "R", era: "2.81" },
          { team: "Visiting Club", name: "Away Arm", throws: "L", era: "3.44" },
        ],
      },
    };
    const rows = find(buildMatchView(snapshot, team).blocks, "pitchers")!.rows;
    expect(rows.find((r) => r.value === "Away Arm")?.note).toContain(
      "vs LHP .251",
    );
    expect(rows.find((r) => r.value === "Home Arm")?.note).not.toContain("vs");
  });

  it("puts the deep Statcast numbers in detail, not in the headline rows", () => {
    const team = getTeam(baseballBase.game.teamSlug)!;
    const context = baseballBase.context;
    if (context.kind !== "baseball")
      throw new Error("expected baseball context");
    const snapshot: GameSnapshot = {
      ...baseballBase,
      context: {
        ...context,
        statcast: {
          trackedTeam: {
            team: team.name,
            teamCode: team.abbreviation,
            season: 2026,
            plateAppearances: 612,
            ballsInPlay: 402,
            battingAverage: 0.262,
            expectedBattingAverage: 0.271,
            slugging: 0.441,
            expectedSlugging: 0.46,
            woba: 0.329,
            expectedWoba: 0.338,
          },
        },
      },
    };
    const bats = find(buildMatchView(snapshot, team).blocks, "bats")!;
    expect(bats.rows).toHaveLength(1);
    expect(bats.rows[0]!.value).toBe(".338 xwOBA");
    expect(bats.rows[0]!.note).toBe("finishing below its contact");
    expect(bats.detail?.map((r) => r.label)).toContain("wOBA / xwOBA");
  });

  it("renders no block, rather than a placeholder, when there is nothing to say", () => {
    const team = getTeam(soccerBase.game.teamSlug)!;
    const context = soccerBase.context;
    if (context.kind !== "soccer") throw new Error("expected soccer context");
    const view = buildMatchView(
      {
        ...soccerBase,
        game: { ...soccerBase.game, venue: "  " },
        context: {
          ...context,
          tablePosition: undefined,
          points: undefined,
          record: undefined,
          recentForm: [],
          availability: [],
          matchupNotes: [],
        },
        evidenceFacts: [soccerBase.evidenceFacts[0]!],
      },
      team,
    );
    expect(view.blocks).toHaveLength(0);
    expect(view.timing.venue).toBeUndefined();
  });

  it("drops datetime facts so no raw ISO string can reach a block", () => {
    const team = getTeam(soccerBase.game.teamSlug)!;
    const view = buildMatchView(soccerBase, team);
    expect(JSON.stringify(view.blocks)).not.toContain(
      soccerBase.game.scheduledAt,
    );
  });
});
