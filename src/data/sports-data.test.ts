import { afterEach, describe, expect, it } from "vitest";
import { getTeamSchedule } from "@/data/sports-data";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalProviderToken = process.env.FOOTBALL_DATA_API_TOKEN;
const originalMode = process.env.MATCHDAY_DATA_MODE;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("DATABASE_URL", originalDatabaseUrl);
  restore("FOOTBALL_DATA_API_TOKEN", originalProviderToken);
  restore("MATCHDAY_DATA_MODE", originalMode);
});

describe("sports data fallback", () => {
  it("returns a validated demo schedule when dependencies are absent", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.FOOTBALL_DATA_API_TOKEN;
    delete process.env.MATCHDAY_DATA_MODE;

    const schedule = await getTeamSchedule("real-madrid", {
      now: new Date("2032-05-04T12:00:00Z"),
    });

    expect(schedule.freshness.mode).toBe("demo");
    expect(schedule.games).toHaveLength(5);
    expect(
      schedule.games.every((game) => game.teamSlug === "real-madrid"),
    ).toBe(true);
  });

  it("forces deterministic demo mode without touching configured services", async () => {
    process.env.DATABASE_URL = "not-a-database-url";
    process.env.FOOTBALL_DATA_API_TOKEN = "not-used";
    process.env.MATCHDAY_DATA_MODE = "demo";

    const schedule = await getTeamSchedule("barcelona");
    expect(schedule.freshness.mode).toBe("demo");
  });
});
