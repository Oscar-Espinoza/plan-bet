import {
  ApiSportsClient,
  isApiSportsConfigured,
} from "../src/providers/api-sports/client";
import {
  API_SPORTS_TEAM_IDS,
  API_SPORTS_TEAM_SPORT,
} from "../src/providers/api-sports/teams";
import type { Sport, TeamSlug } from "../src/lib/contracts";

if (!isApiSportsConfigured()) {
  console.error(
    "API-Sports is not configured. Set DASHBOARD_API_FOOTBALL_KEY in .env.local.",
  );
  process.exit(1);
}

const SEARCH: Record<TeamSlug, string> = {
  "real-madrid": "real madrid",
  barcelona: "barcelona",
  "new-york-yankees": "yankees",
  "boston-red-sox": "red sox",
};

const client = new ApiSportsClient();

for (const sport of [
  "soccer",
  "baseball",
] as const satisfies readonly Sport[]) {
  const status = await client.getStatus(sport);
  console.info(JSON.stringify({ sport, status }, null, 2));
}

const resolved: Record<string, unknown>[] = [];
for (const [slug, search] of Object.entries(SEARCH) as [TeamSlug, string][]) {
  const matches = await client.searchTeams(API_SPORTS_TEAM_SPORT[slug], search);
  resolved.push({
    slug,
    pinned: API_SPORTS_TEAM_IDS[slug],
    candidates: matches.slice(0, 5),
  });
}

console.info(JSON.stringify({ resolved, spent: client.spent }, null, 2));
