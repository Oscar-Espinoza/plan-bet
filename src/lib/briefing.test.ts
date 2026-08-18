import { describe, expect, it } from "vitest";
import { createEvidenceBriefing } from "@/lib/briefing";
import { allGames, getSnapshot, getTeam } from "@/lib/seed";
import type { GameSnapshot } from "@/lib/contracts";

const base = getSnapshot(allGames[0]!.id)!;
const team = getTeam(base.game.teamSlug)!;
const scheduledAt = base.game.scheduledAt;

const withScheduleFact: GameSnapshot = {
  ...base,
  evidenceFacts: [
    {
      id: `${base.game.id}-fact-schedule`,
      label: "Scheduled time",
      value: scheduledAt,
      valueType: "datetime",
      sourceId: base.sources[0]!.id,
      observedAt: base.freshness.fetchedAt,
    },
    ...base.evidenceFacts,
  ],
};

describe("createEvidenceBriefing", () => {
  it("keeps machine timestamps out of prose and exposes them for local rendering", () => {
    const briefing = createEvidenceBriefing(withScheduleFact, team);
    const item = briefing.items[0]!;

    expect(item.text).not.toContain(scheduledAt);
    expect(item.timestamp).toBe(scheduledAt);
  });

  it("composes text facts inline without a timestamp", () => {
    const briefing = createEvidenceBriefing(withScheduleFact, team);
    const item = briefing.items[1]!;
    const fact = withScheduleFact.evidenceFacts[1]!;

    expect(item.text).toBe(`${fact.label}: ${fact.value}.`);
    expect(item.timestamp).toBeUndefined();
  });
});
