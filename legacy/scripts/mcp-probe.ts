import { callMcpTool, readMcpServer } from "../src/providers/mcp-http";

/**
 * The Phase G2 transport gate. Both context sources are remote MCP servers;
 * this proves a plain server-side `fetch` reaches them before any adapter is
 * written against that assumption.
 */
const apifootball = readMcpServer(
  "APIFOOTBALL_MCP_URL",
  "APIFOOTBALL_MCP_TOKEN",
);
const bigballs = readMcpServer("BIGBALLS_MCP_URL", "BIG_BALLS_API_KEY");

if (!apifootball || !bigballs) {
  console.error(
    "MCP sources are not configured. Set APIFOOTBALL_MCP_URL/APIFOOTBALL_MCP_TOKEN and BIGBALLS_MCP_URL/BIG_BALLS_API_KEY in .env.local.",
  );
  process.exit(1);
}

const today = new Date();
const iso = (offsetDays: number) =>
  new Date(today.getTime() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

const probes = [
  {
    server: apifootball,
    tool: "get_football_matches",
    args: { date_from: iso(0), date_to: iso(14), league_id: "302", limit: 3 },
  },
  {
    server: apifootball,
    tool: "get_head_to_head",
    args: { team1_id: "97", team2_id: "7274" },
  },
  {
    server: bigballs,
    tool: "get_matches",
    args: { sport: "baseball", league: "mlb", status: "scheduled", limit: 3 },
  },
  {
    server: bigballs,
    tool: "get_standings",
    args: { sport: "baseball", league: "mlb", season: today.getUTCFullYear() },
  },
] as const;

let failed = 0;
for (const probe of probes) {
  try {
    const result = await callMcpTool(probe.server, probe.tool, probe.args);
    const rows = Array.isArray(result)
      ? result.length
      : typeof result === "object" && result !== null
        ? Object.keys(result).length
        : 0;
    console.info(
      JSON.stringify({
        tool: probe.tool,
        ok: true,
        shape: Array.isArray(result) ? "array" : typeof result,
        rows,
        sample: JSON.stringify(
          Array.isArray(result) ? result[0] : result,
        ).slice(0, 240),
      }),
    );
  } catch (error) {
    failed += 1;
    console.error(
      JSON.stringify({
        tool: probe.tool,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

console.info(JSON.stringify({ probes: probes.length, failed }));
if (failed > 0) process.exitCode = 1;
