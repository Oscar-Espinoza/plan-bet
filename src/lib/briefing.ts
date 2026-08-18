import {
  briefingSchema,
  type Briefing,
  type GameSnapshot,
  type Team,
} from "@/lib/contracts";

export function createEvidenceBriefing(
  snapshot: GameSnapshot,
  team: Team,
): Briefing {
  const facts = snapshot.evidenceFacts.slice(0, 7);
  if (facts.length < 5) {
    throw new Error(`Snapshot ${snapshot.game.id} has fewer than five facts`);
  }
  return briefingSchema.parse({
    gameId: snapshot.game.id,
    mode: "demo",
    summary: `A deterministic evidence review for ${team.shortName}'s upcoming fixture. No live AI is active yet.`,
    items: facts.map((fact, index) => ({
      id: `${snapshot.game.id}-brief-${index + 1}`,
      category: fact.label,
      text: `${fact.label}: ${fact.value}.`,
      evidenceIds: [fact.id],
    })),
    limitations: [
      "This briefing is a deterministic template, not live AI generation.",
      "Availability is shown only when the source explicitly provides it.",
    ],
    generatedAt: snapshot.freshness.fetchedAt,
  });
}
