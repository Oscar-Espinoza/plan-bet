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
    // The seeded snapshot already leads with a schedule fact; stripping every
    // valueType reproduces a row cached before the field existed.
    const legacy = {
      ...base,
      evidenceFacts: base.evidenceFacts.map(asStoredBeforeValueType),
    };

    const parsed = gameSnapshotSchema.parse(legacy);

    expect(parsed.evidenceFacts[0]?.valueType).toBe("datetime");
    expect(parsed.evidenceFacts[1]?.valueType).toBe("text");
  });
});
