import type { BoardData } from "#lib/shared/board";
import { getCachedDashboardData } from "#lib/server/data/sports-data";
import { sportPreferenceSchema } from "#lib/server/domain/sport-preference";
import { SPORT_COOKIE } from "#lib/shared/sport-preference";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, cookies }) => {
  const sport = sportPreferenceSchema.parse(
    url.searchParams.get("sport") ?? cookies.get(SPORT_COOKIE),
  );
  const dashboard = await getCachedDashboardData();
  const data = Object.fromEntries(
    Object.entries(dashboard).map(([slug, { team, games, freshness }]) => [
      slug,
      { team, games, freshness },
    ]),
  ) as BoardData;
  return { data, sport };
};
