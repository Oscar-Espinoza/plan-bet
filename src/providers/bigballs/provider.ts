import "server-only";

import type { TeamSlug } from "@/lib/contracts";
import {
  callMcpTool,
  readMcpServer,
  type McpCallOptions,
} from "@/providers/mcp-http";
import {
  bigBallsMatchesSchema,
  bigBallsStandingsSchema,
} from "@/providers/bigballs/schemas";

/**
 * BigBalls keys teams by name in match rows and by uuid in standings, so the
 * tracked pair is pinned by the name the match feed uses. Two strings that do
 * not change.
 */
export const BIGBALLS_TEAM_NAMES: Partial<Record<TeamSlug, string>> = {
  "new-york-yankees": "New York Yankees",
  "boston-red-sox": "Boston Red Sox",
};

export const BIGBALLS_MLB = { sport: "baseball", league: "mlb" } as const;

export function bigBallsServer() {
  return readMcpServer("BIGBALLS_MCP_URL", "BIG_BALLS_API_KEY");
}

export function isBigBallsConfigured() {
  return bigBallsServer() !== undefined;
}

function requireServer() {
  const server = bigBallsServer();
  if (!server) {
    throw new Error("BigBalls is not configured");
  }
  return server;
}

/**
 * Scheduled matches reach ~2 days out — the vendor ingests the slate daily — so
 * baseball enrichment is a near-kickoff job however far the board runs. Finished
 * matches go back to 1990, which is where recent form and head-to-head come from.
 */
export async function fetchMatches(
  input: {
    status?: "scheduled" | "finished";
    date?: string;
    limit?: number;
  } = {},
  options?: McpCallOptions,
) {
  const raw = await callMcpTool(
    requireServer(),
    "get_matches",
    {
      ...BIGBALLS_MLB,
      ...(input.status ? { status: input.status } : {}),
      ...(input.date ? { date: input.date } : {}),
      limit: input.limit ?? 100,
    },
    options,
  );
  return bigBallsMatchesSchema.parse(raw);
}

export async function fetchStandings(
  input: { season?: number } = {},
  options?: McpCallOptions,
) {
  const raw = await callMcpTool(
    requireServer(),
    "get_standings",
    {
      ...BIGBALLS_MLB,
      season: input.season ?? new Date().getUTCFullYear(),
    },
    options,
  );
  return bigBallsStandingsSchema.parse(raw);
}
