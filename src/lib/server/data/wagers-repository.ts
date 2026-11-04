import { and, eq, sql } from "drizzle-orm";
import { getDatabase, type Database } from "../db/client";
import { creditEntries, wagers } from "../db/schema";

export function openWagerCountQuery(db: Database, userId: string) {
  return db
    .select({ count: sql<number>`count(*)` })
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, userId),
        sql`not exists (
          select 1 from ${creditEntries}
          where ${creditEntries.wagerId} = ${wagers.id}
            and ${creditEntries.kind} = 'return'
        )`,
      ),
    );
}

/** Open wagers for one user; T08 reuses this from placement and /you. */
export async function countOpenWagers(userId: string): Promise<number> {
  const [row] = await openWagerCountQuery(getDatabase(), userId);
  return row?.count ?? 0;
}
