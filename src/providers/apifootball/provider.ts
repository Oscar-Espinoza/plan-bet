import "server-only";

import type { TeamSlug } from "@/lib/contracts";
import {
  callMcpTool,
  readMcpServer,
  type McpCallOptions,
} from "@/providers/mcp-http";
import {
  apiFootballHeadToHeadSchema,
  apiFootballMatchesSchema,
  apiFootballPredictionsSchema,
  apiFootballStandingsSchema,
} from "@/providers/apifootball/schemas";

/**
 * Resolved once through the MCP `search_football_leagues` / match tools and
 * pinned. Three integers that do not change; a config table would be ceremony.
 * These are apifootball's own ids and deliberately differ from the API-Sports
 * ids in `providers/api-sports/teams.ts` — the two vendors share no identifier.
 */
export const APIFOOTBALL_TEAM_IDS: Partial<Record<TeamSlug, string>> = {
  "real-madrid": "76",
  barcelona: "97",
};

export const APIFOOTBALL_LA_LIGA_ID = "302";

/** apifootball's forward window is 15 days; the board only reaches 14. */
export const APIFOOTBALL_MAX_RANGE_DAYS = 14;

export function apiFootballServer() {
  return readMcpServer("APIFOOTBALL_MCP_URL", "APIFOOTBALL_MCP_TOKEN");
}

export function isApiFootballConfigured() {
  return apiFootballServer() !== undefined;
}

function requireServer() {
  const server = apiFootballServer();
  if (!server) {
    throw new Error("apifootball is not configured");
  }
  return server;
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Every fixture in a league between two dates. `limit` is capped at 100 by the tool. */
export async function fetchMatches(
  input: { from: Date; to: Date; leagueId?: string; limit?: number },
  options?: McpCallOptions,
) {
  const raw = await callMcpTool(
    requireServer(),
    "get_football_matches",
    {
      date_from: isoDate(input.from),
      date_to: isoDate(input.to),
      league_id: input.leagueId ?? APIFOOTBALL_LA_LIGA_ID,
      limit: input.limit ?? 100,
    },
    options,
  );
  return apiFootballMatchesSchema.parse(raw);
}

/**
 * Completed meetings plus each side's recent finished results. Forward-looking
 * fixtures never appear here — the tool is historical by design — so this is
 * only ever a source of context, never of the fixture being matched.
 */
export async function fetchHeadToHead(
  input: { homeTeamId: string; awayTeamId: string },
  options?: McpCallOptions,
) {
  const raw = await callMcpTool(
    requireServer(),
    "get_head_to_head",
    { team1_id: input.homeTeamId, team2_id: input.awayTeamId },
    options,
  );
  return apiFootballHeadToHeadSchema.parse(raw);
}

export async function fetchPredictions(
  input: { from: Date; to: Date; leagueId?: string; limit?: number },
  options?: McpCallOptions,
) {
  const raw = await callMcpTool(
    requireServer(),
    "get_football_predictions",
    {
      date_from: isoDate(input.from),
      date_to: isoDate(input.to),
      league_id: input.leagueId ?? APIFOOTBALL_LA_LIGA_ID,
      limit: input.limit ?? 100,
    },
    options,
  );
  return apiFootballPredictionsSchema.parse(raw);
}

export async function fetchStandings(
  input: { leagueId?: string } = {},
  options?: McpCallOptions,
) {
  const raw = await callMcpTool(
    requireServer(),
    "get_football_standings",
    { league_id: input.leagueId ?? APIFOOTBALL_LA_LIGA_ID },
    options,
  );
  return apiFootballStandingsSchema.parse(raw);
}
