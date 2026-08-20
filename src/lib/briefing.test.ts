import { describe, expect, it } from "vitest";
import { createEvidenceBriefing } from "@/lib/briefing";
import { allGames, getSnapshot, getTeam } from "@/lib/seed";

const snapshot = getSnapshot(allGames[0]!.id)!;
const team = getTeam(snapshot.game.teamSlug)!;
const scheduledAt = snapshot.game.scheduledAt;

describe("createEvidenceBriefing", () => {
  it("keeps machine timestamps out of prose and exposes them for local rendering", () => {
    const briefing = createEvidenceBriefing(snapshot, team);
    const item = briefing.items[0]!;

    expect(snapshot.evidenceFacts[0]!.valueType).toBe("datetime");
    expect(item.text).not.toContain(scheduledAt);
    expect(item.timestamp).toBe(scheduledAt);
  });

  it("composes text facts inline without a timestamp", () => {
    const briefing = createEvidenceBriefing(snapshot, team);
    const item = briefing.items[1]!;
    const fact = snapshot.evidenceFacts[1]!;

    expect(item.text).toBe(`${fact.label}: ${fact.value}.`);
    expect(item.timestamp).toBeUndefined();
  });

  it("labels a seeded snapshot demo and a stored snapshot fallback", () => {
    expect(createEvidenceBriefing(snapshot, team).mode).toBe("demo");
    expect(
      createEvidenceBriefing(
        { ...snapshot, freshness: { ...snapshot.freshness, mode: "live" } },
        team,
      ).mode,
    ).toBe("fallback");
  });

  it("builds a valid two-item fallback briefing from a thin snapshot instead of throwing", () => {
    const thin = {
      ...snapshot,
      evidenceFacts: snapshot.evidenceFacts.slice(0, 2),
    };

    const briefing = createEvidenceBriefing(thin, team);

    expect(briefing.items).toHaveLength(2);
  });
});
