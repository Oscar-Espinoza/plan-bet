import { createHash } from "node:crypto";
import type { Database } from "@/db/client";
import { teams as teamTable } from "@/db/schema";
import { teams } from "@/lib/seed";

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

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
      payloadHash: hash(team),
      updatedAt: now,
    };
    await database.insert(teamTable).values(row).onConflictDoNothing();
  }

  return database.select().from(teamTable);
}
