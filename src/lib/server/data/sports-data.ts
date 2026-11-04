import { env } from "cloudflare:workers";
import {
  gameScheduleSchema,
  type GameDetailData,
  type GameSchedule,
  type Sport,
  type TeamSlug,
} from "../domain/contracts";
import { generateGames, getSnapshot, getTeam, teams } from "../domain/seed";
import { isDatabaseConfigured } from "../db/client";
import { readStoredSchedule, readStoredSnapshot } from "./sports-repository";

export type DashboardData = Record<TeamSlug, GameSchedule>;

function isDemoMode() {
  return env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo";
}

/**
 * T03 sends this to the jobs Worker. Stale and cold reads call it so the
 * request path never waits on a provider. Until then it does nothing.
 */
export function scheduleRefresh(sport: Sport, requestId?: string) {
  // T03 replaces this body with the jobs binding. Keep the arguments so call sites stay stable.
  void sport;
  void requestId;
}

function demoSchedule(slug: TeamSlug, now = new Date()) {
  const team = getTeam(slug)!;
  const games = generateGames(slug, now);
  const snapshot = getSnapshot(games[0]!.id, now)!;
  return gameScheduleSchema.parse({
    team,
    games,
    context: snapshot.context,
    freshness: snapshot.freshness,
  });
}

async function storedSchedule(slug: TeamSlug, now: Date) {
  try {
    return await readStoredSchedule(slug, now);
  } catch {
    return undefined;
  }
}

async function storedSnapshot(gameId: string, now: Date) {
  try {
    return await readStoredSnapshot(gameId, now);
  } catch {
    return undefined;
  }
}

export async function getTeamSchedule(
  slug: TeamSlug,
  options: { now?: Date; forceRefresh?: boolean; requestId?: string } = {},
) {
  const now = options.now ?? new Date();
  const requestId = options.requestId ?? crypto.randomUUID();
  const team = getTeam(slug)!;
  if (isDemoMode() || !isDatabaseConfigured()) {
    return demoSchedule(slug, now);
  }

  const cached = await storedSchedule(slug, now);
  // Stale renders now. Cold reads also return immediately with the demo seed.
  if (cached && !options.forceRefresh) {
    if (cached.freshness.mode !== "live") {
      scheduleRefresh(team.sport, requestId);
    }
    return cached;
  }

  if (!options.forceRefresh) {
    scheduleRefresh(team.sport, requestId);
    return demoSchedule(slug, now);
  }
  scheduleRefresh(team.sport, requestId);
  return (await storedSchedule(slug, now)) ?? cached ?? demoSchedule(slug, now);
}

export async function getDashboardData(
  options: { now?: Date; requestId?: string } = {},
) {
  const now = options.now ?? new Date();
  const requestId = options.requestId ?? crypto.randomUUID();
  const entries = await Promise.all(
    teams.map(async (team) => {
      const schedule = await getTeamSchedule(team.slug, { now, requestId });
      // Board shows the next match only; providers still persist five.
      return [team.slug, { ...schedule, games: schedule.games.slice(0, 1) }];
    }),
  );
  return Object.fromEntries(entries) as DashboardData;
}

export async function getGameDetail(
  gameId: string,
  options: { now?: Date; requestId?: string } = {},
): Promise<GameDetailData | undefined> {
  const now = options.now ?? new Date();
  const requestId = options.requestId ?? crypto.randomUUID();
  const demoSnapshot = getSnapshot(gameId, now);
  if (demoSnapshot) return { snapshot: demoSnapshot };
  if (isDemoMode() || !isDatabaseConfigured()) return undefined;

  const snapshot = await storedSnapshot(gameId, now);
  if (snapshot?.freshness.mode === "stale") {
    scheduleRefresh(snapshot.game.sport, requestId);
  }
  if (!snapshot) return undefined;
  // Stored fixture context is merged in T03. A missing row leaves the snapshot as stored.
  return { snapshot };
}

export function getConfiguredTeams() {
  return teams;
}
