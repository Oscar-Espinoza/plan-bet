import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { applyScheduleMode, applySnapshotMode } from "../domain/cache-policy";
import {
  gameScheduleSchema,
  gameSnapshotSchema,
  type GameSchedule,
  type GameSnapshot,
  type TeamSlug,
} from "../domain/contracts";
import { generateGames, teams } from "../domain/seed";
import { getDatabase, isDatabaseConfigured } from "../db/client";
import { gameSnapshots, games, teams as teamsTable } from "../db/schema";
import { logEvent } from "../logger";
import { readFixtureContext } from "./fixture-context-repository";
import { withContextFacts } from "./fixture-facts";

export type BoardReadModel = Record<
  TeamSlug,
  Pick<GameSchedule, "team" | "games" | "freshness" | "context">
>;

export type GameReadModel = {
  snapshot: GameSnapshot;
  expiresAt: string;
};

const BOARD_KEY = "board:v1";
const ROUTES_KEY = "routes:v1";
const VERSION_KEY = "publish:version";

export function gameReadModelKey(routeId: string) {
  return `game:v1:${routeId}`;
}

async function buildBoardPayload(): Promise<BoardReadModel | undefined> {
  const database = getDatabase();
  const board = {} as BoardReadModel;
  for (const team of teams) {
    const [row] = await database
      .select({ schedule: teamsTable.schedule })
      .from(teamsTable)
      .where(eq(teamsTable.slug, team.slug))
      .limit(1);
    if (!row?.schedule) continue;
    const schedule = gameScheduleSchema.parse(row.schedule);
    board[team.slug] = {
      team: schedule.team,
      games: schedule.games.slice(0, 1),
      context: schedule.context,
      freshness: schedule.freshness,
    };
  }
  return Object.keys(board).length > 0 ? board : undefined;
}

async function buildRoutesPayload(now: Date) {
  const database = getDatabase();
  const rows = await database
    .select({
      routeId: gameSnapshots.routeId,
      canonicalId: games.canonicalId,
    })
    .from(gameSnapshots)
    .innerJoin(games, eq(games.id, gameSnapshots.gameId));
  const routes: Record<string, string> = Object.fromEntries(
    rows.map((row) => [row.routeId, row.canonicalId]),
  );
  for (const team of teams) {
    for (const game of generateGames(team.slug, now)) {
      routes[game.id] = game.id;
    }
  }
  return routes;
}

async function buildGamePayloads() {
  const database = getDatabase();
  const rows = await database
    .select({
      routeId: gameSnapshots.routeId,
      snapshot: gameSnapshots.snapshot,
      expiresAt: gameSnapshots.expiresAt,
    })
    .from(gameSnapshots);
  const payloads: Array<[string, GameReadModel]> = [];
  for (const row of rows) {
    let snapshot = gameSnapshotSchema.parse(row.snapshot);
    const stored = await readFixtureContext(row.routeId).catch(() => undefined);
    if (stored) snapshot = withContextFacts(snapshot, stored.facts);
    payloads.push([
      gameReadModelKey(row.routeId),
      {
        snapshot,
        expiresAt: row.expiresAt.toISOString(),
      },
    ]);
  }
  return payloads;
}

/**
 * Rebuilds KV read models from D1 last-known-good. Failures are logged and never
 * thrown into refresh or enrich.
 */
export async function publishReadModels(now = new Date()) {
  if (!isDatabaseConfigured() || !env.PUBLIC) return;
  try {
    const board = await buildBoardPayload();
    if (!board) return;
    const routes = await buildRoutesPayload(now);
    const games = await buildGamePayloads();
    const current = await env.PUBLIC.get(VERSION_KEY);
    const next = String((Number(current ?? "0") || 0) + 1);
    await env.PUBLIC.put(BOARD_KEY, JSON.stringify(board));
    await Promise.all(
      games.map(([key, value]) => env.PUBLIC!.put(key, JSON.stringify(value))),
    );
    await env.PUBLIC.put(ROUTES_KEY, JSON.stringify(routes));
    await env.PUBLIC.put(VERSION_KEY, next);
    logEvent("info", "publish_read_models", {
      version: next,
      games: games.length,
    });
  } catch (error) {
    logEvent("warn", "publish_read_models", {
      status: "failed",
      errorName: error instanceof Error ? error.name : "unknown",
      message:
        error instanceof Error ? error.message.slice(0, 240) : "publish failed",
    });
  }
}

export async function readBoardFromKv(now = new Date()) {
  if (!env.PUBLIC) return undefined;
  const raw = await env.PUBLIC.get(BOARD_KEY, "json");
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = raw as BoardReadModel;
  const entries = Object.entries(parsed).map(([slug, schedule]) => [
    slug,
    applyScheduleMode(gameScheduleSchema.parse(schedule), now),
  ]);
  return Object.fromEntries(entries) as BoardReadModel;
}

export async function readGameFromKv(routeId: string, now = new Date()) {
  if (!env.PUBLIC) return undefined;
  const raw = await env.PUBLIC.get(gameReadModelKey(routeId), "json");
  if (!raw || typeof raw !== "object") return undefined;
  const model = raw as GameReadModel;
  return applySnapshotMode(gameSnapshotSchema.parse(model.snapshot), now);
}
