import { getTeamSchedule, refreshSoccerData } from "../src/data/sports-data";

await refreshSoccerData();

const schedules = await Promise.all(
  (["real-madrid", "barcelona"] as const).map(async (slug) => {
    const schedule = await getTeamSchedule(slug);
    return {
      slug,
      mode: schedule.freshness.mode,
      provider: schedule.freshness.provider,
      games: schedule.games.length,
      fetchedAt: schedule.freshness.fetchedAt,
    };
  }),
);

console.info(JSON.stringify({ schedules }, null, 2));
if (schedules.some((schedule) => schedule.mode !== "live")) {
  process.exitCode = 1;
}
