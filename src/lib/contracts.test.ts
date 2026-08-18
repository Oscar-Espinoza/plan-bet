import { describe, expect, it } from "vitest";
import { gameSnapshotSchema, type EvidenceFact } from "@/lib/contracts";
import { allGames, getSnapshot } from "@/lib/seed";

const base = getSnapshot(allGames[0]!.id)!;

/** Reproduces a fact stored before `valueType` was part of the contract. */
function asStoredBeforeValueType(fact: EvidenceFact) {
  const stored: Record<string, unknown> = { ...fact };
  delete stored.valueType;
  return stored;
}

describe("gameSnapshotSchema", () => {
  it("reads a cached scheduled-time fact as a datetime even without valueType", () => {
    const legacy = {
      ...base,
      evidenceFacts: [
        {
          id: `${base.game.id}-fact-schedule`,
          label: "Scheduled time",
          value: base.game.scheduledAt,
          sourceId: base.sources[0]!.id,
          observedAt: base.freshness.fetchedAt,
        },
        ...base.evidenceFacts.map(asStoredBeforeValueType),
      ],
    };

    const parsed = gameSnapshotSchema.parse(legacy);

    expect(parsed.evidenceFacts[0]?.valueType).toBe("datetime");
    expect(parsed.evidenceFacts[1]?.valueType).toBe("text");
  });
});
