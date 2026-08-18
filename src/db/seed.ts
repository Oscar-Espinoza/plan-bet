import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { teams as teamTable } from "@/db/schema";
import { teams } from "@/lib/seed";

const DAY = 86_400_000;

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function seedConfiguredTeams(
  database: Database,
  now = new Date(),
) {
  for (const team of teams) {
    const provider = team.sport === "soccer" ? "football-data" : "demo";
    const externalId = team.providerIds[provider];
    if (!externalId) throw new Error(`Missing ${provider} ID for ${team.slug}`);
    const expiresAt =
      team.sport === "soccer" ? new Date(0) : new Date(now.getTime() + 7 * DAY);
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

  return database.select().from(teamTable).where(eq(teamTable.sport, "soccer"));
}
