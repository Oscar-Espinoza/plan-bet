import type { BoardData } from "#lib/shared/board";
import {
  getCachedDashboardData,
  getDashboardData,
} from "#lib/server/data/sports-data";
import { sportPreferenceSchema } from "#lib/server/domain/sport-preference";
import type { TeamSlug } from "#lib/server/domain/contracts";
import { SPORT_COOKIE } from "#lib/shared/sport-preference";
import type { PageServerLoad } from "./$types";

const TRACKED_SLUGS: TeamSlug[] = [
  "real-madrid",
  "barcelona",
  "new-york-yankees",
  "boston-red-sox",
];

export const load: PageServerLoad = async ({ url, cookies }) => {
  const sport = sportPreferenceSchema.parse(
    url.searchParams.get("sport") ?? cookies.get(SPORT_COOKIE),
  );
  const dashboard = await getCachedDashboardData();
  const seed = TRACKED_SLUGS.some((slug) => !dashboard[slug])
    ? await getDashboardData()
    : null;
  const data = Object.fromEntries(
    TRACKED_SLUGS.map((slug) => {
      const schedule = dashboard[slug] ?? seed![slug];
      return [
        slug,
        {
          team: schedule.team,
          games: schedule.games,
          freshness: schedule.freshness,
        },
      ];
    }),
  ) as BoardData;
  return { data, sport };
};
