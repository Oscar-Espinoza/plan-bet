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
const HASHES_KEY = "publish:hashes:v1";
export const PUBLISH_LAST_AT_KEY = "publish:lastAt";

/**
 * Key-sorted JSON. D1 row order must not look like a content change.
 * The stored string is the string we hash.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] !== undefined) sorted[key] = canonicalize(source[key]);
  }
  return sorted;
}

async function contentHash(json: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json),
  );
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex.slice(0, 16);
}

function hashManifest(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const manifest: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") manifest[key] = value;
  }
  return manifest;
}

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
 * Rebuilds KV read models from D1 last-known-good. Writes a key only when its
 * content hash changed, and bumps `publish:version` only then. Failures are
 * logged and never thrown into refresh or enrich.
 */
export async function publishReadModels(now = new Date()) {
  const kv = env.PUBLIC;
  if (!isDatabaseConfigured() || !kv) return;
  try {
    const board = await buildBoardPayload();
    if (!board) return;
    const routes = await buildRoutesPayload(now);
    const gamePayloads = await buildGamePayloads();
    const [manifestRaw, versionRaw] = await Promise.all([
      kv.get(HASHES_KEY, "json"),
      kv.get(VERSION_KEY),
    ]);
    const manifest = hashManifest(manifestRaw);
    const current = versionRaw?.trim() || "0";
    const entries = [
      { key: BOARD_KEY, json: stableStringify(board) },
      ...gamePayloads.map(([key, value]) => ({
        key,
        json: stableStringify(value),
      })),
      { key: ROUTES_KEY, json: stableStringify(routes) },
    ];
    const hashed = await Promise.all(
      entries.map(async (entry) => ({
        ...entry,
        hash: await contentHash(entry.json),
      })),
    );
    const nextManifest: Record<string, string> = {};
    const puts: Promise<unknown>[] = [];
    let written = 0;
    let unchanged = 0;
    for (const entry of hashed) {
      nextManifest[entry.key] = entry.hash;
      if (manifest[entry.key] === entry.hash) {
        unchanged += 1;
        continue;
      }
      written += 1;
      puts.push(kv.put(entry.key, entry.json));
    }
    await Promise.all(puts);
    let version = current;
    if (written > 0) {
      version = String((Number(current) || 0) + 1);
      await kv.put(VERSION_KEY, version);
      await kv.put(PUBLISH_LAST_AT_KEY, now.toISOString());
      await kv.put(HASHES_KEY, stableStringify(nextManifest));
    }
    logEvent("info", "publish_read_models", {
      games: gamePayloads.length,
      written,
      unchanged,
      version,
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
