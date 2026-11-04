import { env, waitUntil } from "cloudflare:workers";
import { applyScheduleMode } from "../domain/cache-policy";
import {
  gameScheduleSchema,
  type GameDetailData,
  type GameSchedule,
  type Sport,
  type TeamSlug,
} from "../domain/contracts";
import { generateGames, getSnapshot, getTeam, teams } from "../domain/seed";
import { seedConfiguredTeams } from "../db/seed";
import { getDatabase, isDatabaseConfigured } from "../db/client";
import { logEvent } from "../logger";
import type { CachedTeamMetadata } from "../providers/contracts";
import { providerErrorCode } from "../providers/provider-error";
import { getSportsProvider } from "../providers/registry";
import { readFixtureContext } from "./fixture-context-repository";
import { withContextFacts } from "./fixture-facts";
import { publishReadModels, readBoardFromKv, readGameFromKv } from "./publish";
import {
  acquireRefreshLease,
  completeRefreshLease,
  getStoredTeamMetadata,
  persistSportsTeamData,
  readStoredSchedule,
  readStoredSnapshot,
  recordProviderDiagnostic,
} from "./sports-repository";

export type DashboardData = Record<TeamSlug, GameSchedule>;

export type RefreshOutcome = {
  sport: Sport;
  provider: string;
  status: "succeeded" | "failed" | "skipped";
  reason?: "unconfigured" | "locked";
  errorCode?: string;
  refreshed: number;
  durationMs: number;
};

const MEMO_MS = 10_000;
let boardMemo: { at: number; data?: DashboardData } = { at: 0 };
const gameMemo = new Map<
  string,
  { at: number; snapshot?: GameDetailData["snapshot"] }
>();

function isDemoMode() {
  return env.MATCHDAY_DATA_MODE?.toLowerCase() === "demo";
}

function logIngestion(
  level: "info" | "warn",
  details: Record<string, unknown>,
) {
  logEvent(level, "sports_ingestion", details);
}

const inProcessRefresh = new Map<Sport, Promise<RefreshOutcome>>();

export function scheduleRefresh(sport: Sport, requestId?: string) {
  try {
    if (!env.JOBS?.refresh) return;
    waitUntil(env.JOBS.refresh(sport).catch(() => undefined));
  } catch {
    void sport;
    void requestId;
  }
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

async function cachedMetadata(
  sport: Sport,
  now: Date,
): Promise<Partial<Record<TeamSlug, CachedTeamMetadata>>> {
  const provider = getSportsProvider(sport);
  const cached: Partial<Record<TeamSlug, CachedTeamMetadata>> = {};
  for (const slug of provider.teamSlugs) {
    const row = await getStoredTeamMetadata(slug);
    if (row && row.provider === provider.provider && row.expiresAt > now) {
      cached[slug] = {
        team: row.canonical,
        providerExternalId: row.externalId,
        sourceObservedAt: row.sourceObservedAt,
        expiresAt: row.expiresAt,
      };
    }
  }
  return cached;
}

async function performSportRefresh(
  sport: Sport,
  requestId: string,
  now = new Date(),
): Promise<RefreshOutcome> {
  const refreshStartedAt = Date.now();
  const provider = getSportsProvider(sport);
  if (!isDatabaseConfigured() || !provider.isConfigured()) {
    return {
      sport,
      provider: provider.provider,
      status: "skipped",
      reason: "unconfigured",
      refreshed: 0,
      durationMs: Date.now() - refreshStartedAt,
    };
  }

  await seedConfiguredTeams(getDatabase(), now);
  const lease = await acquireRefreshLease({
    provider: provider.provider,
    operation: provider.refreshOperation,
    scope: provider.refreshScope,
    requestId,
    now,
  });
  if (!lease) {
    return {
      sport,
      provider: provider.provider,
      status: "skipped",
      reason: "locked",
      refreshed: 0,
      durationMs: Date.now() - refreshStartedAt,
    };
  }

  const startedAt = Date.now();
  try {
    const result = await provider.refresh({
      now,
      cachedTeams: await cachedMetadata(sport, now),
    });
    const failures = [...result.failures];
    let refreshed = 0;
    for (const bundle of result.bundles) {
      try {
        await persistSportsTeamData({ bundle, fetchedAt: now });
        refreshed += 1;
        await publishReadModels(now);
        logIngestion("info", {
          requestId,
          sport,
          provider: provider.provider,
          operation: "refresh_team",
          scope: bundle.schedule.team.slug,
          status: "succeeded",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const errorCode = providerErrorCode(error);
        failures.push({
          teamSlug: bundle.schedule.team.slug,
          code: errorCode,
        });
        logIngestion("warn", {
          requestId,
          sport,
          provider: provider.provider,
          operation: "refresh_team",
          scope: bundle.schedule.team.slug,
          status: "failed",
          errorCode,
          durationMs: Date.now() - startedAt,
        });
      }
    }
    for (const diagnostic of result.diagnostics ?? []) {
      await recordProviderDiagnostic({
        ...diagnostic,
        scope: provider.refreshScope,
        requestId,
        errorCode: diagnostic.code,
        errorMessage: diagnostic.message,
        now,
      });
    }
    const failure = failures[0];
    await completeRefreshLease({
      ...lease,
      status: failure ? "failed" : "succeeded",
      cacheResult: refreshed ? "refreshed" : "stale",
      errorCode: failure?.code,
      errorMessage: failure ? `${sport} refresh was incomplete` : undefined,
    });
    logIngestion(failure ? "warn" : "info", {
      requestId,
      sport,
      provider: provider.provider,
      operation: provider.refreshOperation,
      scope: provider.refreshScope,
      status: failure ? "failed" : "succeeded",
      errorCode: failure?.code,
      refreshed,
      durationMs: Date.now() - startedAt,
    });

    return {
      sport,
      provider: provider.provider,
      status: failure ? "failed" : "succeeded",
      errorCode: failure?.code,
      refreshed,
      durationMs: Date.now() - refreshStartedAt,
    };
  } catch (error) {
    const errorCode = providerErrorCode(error);
    await completeRefreshLease({
      ...lease,
      status: "failed",
      cacheResult: "stale",
      errorCode,
      errorMessage:
        error instanceof Error ? error.message : `${sport} refresh failed`,
    });
    logIngestion("warn", {
      requestId,
      sport,
      provider: provider.provider,
      operation: provider.refreshOperation,
      scope: provider.refreshScope,
      status: "failed",
      errorCode,
      durationMs: Date.now() - startedAt,
    });
    return {
      sport,
      provider: provider.provider,
      status: "failed",
      errorCode,
      refreshed: 0,
      durationMs: Date.now() - refreshStartedAt,
    };
  }
}

export function refreshSportData(
  sport: Sport,
  requestId: string = crypto.randomUUID(),
  now = new Date(),
) {
  const running = inProcessRefresh.get(sport);
  if (running) return running;
  const refresh = performSportRefresh(sport, requestId, now).finally(() => {
    inProcessRefresh.delete(sport);
  });
  inProcessRefresh.set(sport, refresh);
  return refresh;
}

export function refreshSoccerData(
  requestId = crypto.randomUUID(),
  now = new Date(),
) {
  return refreshSportData("soccer", requestId, now);
}

export function refreshBaseballData(
  requestId = crypto.randomUUID(),
  now = new Date(),
) {
  return refreshSportData("baseball", requestId, now);
}

async function storedSchedule(slug: TeamSlug, now: Date) {
  try {
    return await readStoredSchedule(slug, now);
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
  await refreshSportData(team.sport, requestId, now).catch(() => undefined);
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
      return [team.slug, { ...schedule, games: schedule.games.slice(0, 1) }];
    }),
  );
  return Object.fromEntries(entries) as DashboardData;
}

async function dashboardFromD1(now: Date) {
  const entries = await Promise.all(
    teams.map(async (team) => {
      const schedule = await readStoredSchedule(team.slug, now);
      if (!schedule) throw new Error("Schedule not stored");
      return [team.slug, { ...schedule, games: schedule.games.slice(0, 1) }];
    }),
  );
  return Object.fromEntries(entries) as DashboardData;
}

export async function getCachedDashboardData() {
  if (isDemoMode() || !isDatabaseConfigured()) {
    return getDashboardData();
  }
  const now = new Date();
  try {
    if (Date.now() - boardMemo.at < MEMO_MS && boardMemo.data) {
      return boardMemo.data;
    }
    const fromKv = await readBoardFromKv(now);
    if (fromKv) {
      const stale = new Set<Sport>();
      const entries = Object.entries(fromKv).map(([slug, schedule]) => {
        const current = applyScheduleMode(
          gameScheduleSchema.parse(schedule),
          now,
        );
        if (current.freshness.mode === "stale") stale.add(current.team.sport);
        return [slug, current];
      });
      for (const sport of stale) scheduleRefresh(sport, crypto.randomUUID());
      const data = Object.fromEntries(entries) as DashboardData;
      boardMemo = { at: Date.now(), data };
      return data;
    }
    const data = await dashboardFromD1(now);
    const stale = new Set<Sport>();
    const entries = Object.entries(data).map(([slug, schedule]) => {
      const current = applyScheduleMode(schedule, now);
      if (current.freshness.mode === "stale") stale.add(current.team.sport);
      return [slug, current];
    });
    for (const sport of stale) scheduleRefresh(sport, crypto.randomUUID());
    const resolved = Object.fromEntries(entries) as DashboardData;
    boardMemo = { at: Date.now(), data: resolved };
    return resolved;
  } catch {
    return getDashboardData();
  }
}

async function storedSnapshot(gameId: string, now: Date) {
  try {
    return await readStoredSnapshot(gameId, now);
  } catch {
    return undefined;
  }
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

  const memo = gameMemo.get(gameId);
  if (memo && Date.now() - memo.at < MEMO_MS && memo.snapshot) {
    return { snapshot: memo.snapshot };
  }

  const fromKv = await readGameFromKv(gameId, now);
  if (fromKv) {
    if (fromKv.freshness.mode === "stale") {
      scheduleRefresh(fromKv.game.sport, requestId);
    }
    gameMemo.set(gameId, { at: Date.now(), snapshot: fromKv });
    return { snapshot: fromKv };
  }

  let snapshot = await storedSnapshot(gameId, now);
  if (snapshot?.freshness.mode === "stale") {
    scheduleRefresh(snapshot.game.sport, requestId);
  }
  if (!snapshot) return undefined;
  if (isDatabaseConfigured()) {
    const stored = await readFixtureContext(gameId).catch(() => undefined);
    if (stored) snapshot = withContextFacts(snapshot, stored.facts);
  }
  gameMemo.set(gameId, { at: Date.now(), snapshot });
  return { snapshot };
}

export function getConfiguredTeams() {
  return teams;
}
