import { asc, gte } from "drizzle-orm";
import { getDatabase } from "../src/db/client";
import { games } from "../src/db/schema";
import {
  ApiSportsClient,
  isApiSportsConfigured,
} from "../src/providers/api-sports/client";
import {
  fixturesForTeam,
  matchFixture,
} from "../src/providers/api-sports/match";
import { API_SPORTS_TEAM_IDS } from "../src/providers/api-sports/teams";
import type { ApiSportsFixture } from "../src/providers/api-sports/schemas";
import type { Sport, TeamSlug } from "../src/lib/contracts";

if (!isApiSportsConfigured()) {
  console.error(
    "API-Sports is not configured. Set DASHBOARD_API_FOOTBALL_KEY in .env.local.",
  );
  process.exit(1);
}

/**
 * The free plan only serves fixtures dated within a day either side of today,
 * so anything further out on the board is reported as out of reach rather than
 * counted as a failed match.
 */
const REACHABLE_DAYS = 1;

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

const now = new Date();
const reachable = new Set(
  Array.from({ length: REACHABLE_DAYS * 2 + 1 }, (_, index) =>
    utcDay(new Date(now.getTime() + (index - REACHABLE_DAYS) * 86_400_000)),
  ),
);

const upcoming = await getDatabase()
  .select({
    canonicalId: games.canonicalId,
    sport: games.sport,
    scheduledAt: games.scheduledAt,
    summary: games.summary,
  })
  .from(games)
  .where(gte(games.scheduledAt, now))
  .orderBy(asc(games.scheduledAt));

const client = new ApiSportsClient();
const byDate = new Map<string, ApiSportsFixture[]>();

async function fixturesOn(sport: Sport, day: string) {
  const key = `${sport}:${day}`;
  const cached = byDate.get(key);
  if (cached) return cached;
  const fixtures = await client.getFixturesByDate(sport, day);
  byDate.set(key, fixtures);
  return fixtures;
}

const rows: string[] = [];
let matched = 0;
let unmatched = 0;
let unreachable = 0;

for (const game of upcoming) {
  const day = utcDay(game.scheduledAt);
  const slug = ([
    game.summary.homeTeamSlug,
    game.summary.awayTeamSlug,
    game.summary.teamSlug,
  ].find(Boolean) ?? game.summary.teamSlug) as TeamSlug;
  const label = `${game.canonicalId.padEnd(24)} ${day} ${slug.padEnd(17)}`;

  if (!reachable.has(day)) {
    unreachable += 1;
    rows.push(`${label} OUT-OF-WINDOW (free plan)`);
    continue;
  }

  const fixtures = await fixturesOn(game.sport, day);
  const candidates = fixturesForTeam(fixtures, API_SPORTS_TEAM_IDS[slug]);
  const hit = matchFixture(
    { scheduledAt: game.scheduledAt.toISOString() },
    candidates,
  );

  if (hit) {
    matched += 1;
    rows.push(`${label} -> ${hit.id} (${hit.homeTeam} vs ${hit.awayTeam})`);
  } else {
    unmatched += 1;
    rows.push(
      `${label} UNMATCHED (${candidates.length} candidates on the day)`,
    );
  }
}

console.info(rows.join("\n"));
console.info(
  JSON.stringify({ matched, unmatched, unreachable, spent: client.spent }),
);

if (unmatched > 0) process.exitCode = 1;
