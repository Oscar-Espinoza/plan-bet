import type { Database } from "./client";
import { teams as teamTable } from "./schema";
import { stableHash } from "../domain/stable-hash";
import { teams } from "../domain/seed";

export async function seedConfiguredTeams(
  database: Database,
  now = new Date(),
) {
  for (const team of teams) {
    const provider = team.sport === "soccer" ? "football-data" : "mlb-stats";
    const externalId = team.providerIds[provider];
    if (!externalId) throw new Error(`Missing ${provider} ID for ${team.slug}`);
    const expiresAt = new Date(0);
    const row = {
      slug: team.slug,
      sport: team.sport,
      provider,
      externalId,
      canonical: team,
      sourceObservedAt: now,
      fetchedAt: now,
      expiresAt,
      payloadHash: stableHash(team),
      updatedAt: now,
    };
    await database.insert(teamTable).values(row).onConflictDoNothing();
  }

  return database.select().from(teamTable);
}
