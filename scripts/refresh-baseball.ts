import { getTeamSchedule, refreshBaseballData } from "../src/data/sports-data";

await refreshBaseballData();

const schedules = await Promise.all(
  (["new-york-yankees", "boston-red-sox"] as const).map(async (slug) => {
    const schedule = await getTeamSchedule(slug);
    return {
      slug,
      mode: schedule.freshness.mode,
      provider: schedule.freshness.provider,
      games: schedule.games.length,
      fetchedAt: schedule.freshness.fetchedAt,
      statcast:
        schedule.context.kind === "baseball"
          ? Boolean(schedule.context.statcast?.trackedTeam)
          : false,
    };
  }),
);

console.info(JSON.stringify({ schedules }, null, 2));
if (schedules.some((schedule) => schedule.mode !== "live")) {
  process.exitCode = 1;
}
