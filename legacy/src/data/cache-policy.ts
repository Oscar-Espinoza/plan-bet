import {
  gameScheduleSchema,
  gameSnapshotSchema,
  type DataMode,
  type GameSchedule,
  type GameSnapshot,
} from "@/lib/contracts";

export function modeForExpiry(
  expiresAt: string | undefined,
  now = new Date(),
): Extract<DataMode, "live" | "stale"> {
  return expiresAt && new Date(expiresAt) > now ? "live" : "stale";
}

export function applyScheduleMode(schedule: GameSchedule, now = new Date()) {
  return gameScheduleSchema.parse({
    ...schedule,
    freshness: {
      ...schedule.freshness,
      mode: modeForExpiry(schedule.freshness.expiresAt, now),
    },
  });
}

export function applySnapshotMode(snapshot: GameSnapshot, now = new Date()) {
  return gameSnapshotSchema.parse({
    ...snapshot,
    freshness: {
      ...snapshot.freshness,
      mode: modeForExpiry(snapshot.freshness.expiresAt, now),
    },
  });
}
