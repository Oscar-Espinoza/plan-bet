import {
  briefingSchema,
  type Briefing,
  type EvidenceFactInput,
  type GameSnapshot,
  type Team,
} from "@/lib/contracts";

/**
 * Turns one evidence fact into a briefing item. Datetime facts leave their ISO
 * value out of the prose and hand it to the reader as `timestamp`, so it renders
 * in the browser timezone instead of appearing raw.
 */
export function createBriefingItem(fact: EvidenceFactInput, id: string) {
  return {
    id,
    category: fact.label,
    ...(fact.valueType === "datetime"
      ? { text: `${fact.label}:`, timestamp: fact.value }
      : { text: `${fact.label}: ${fact.value}.` }),
    evidenceIds: [fact.id],
  };
}

export function createEvidenceBriefing(
  snapshot: GameSnapshot,
  team: Team,
): Briefing {
  // The fallback path (unlike the AI path, which independently enforces 5-7
  // via aiBriefingOutputSchema and the strict OpenAI JSON Schema) must degrade
  // gracefully even for a thin snapshot rather than turning into a 500.
  const facts = snapshot.evidenceFacts.slice(0, 7);
  return briefingSchema.parse({
    gameId: snapshot.game.id,
    // Seeded snapshots stay "demo"; a live or stale snapshot's deterministic
    // review is the fallback the AI route serves, so it is labelled as one.
    mode: snapshot.freshness.mode === "demo" ? "demo" : "fallback",
    summary: `A deterministic evidence review for ${team.shortName}'s upcoming fixture, built only from the stored snapshot below.`,
    items: facts.map((fact, index) =>
      createBriefingItem(fact, `${snapshot.game.id}-brief-${index + 1}`),
    ),
    limitations: [
      "This briefing is a deterministic template, not live AI generation.",
      "Availability is shown only when the source explicitly provides it.",
    ],
    generatedAt: snapshot.freshness.fetchedAt,
  });
}
