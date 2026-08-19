import { randomUUID } from "node:crypto";
import { generateBriefing } from "../src/data/briefings";

const gameId = process.argv[2];
if (!gameId) {
  console.error("Usage: pnpm smoke:briefing <route-id>");
  process.exit(2);
}

const outcome = await generateBriefing({
  gameId,
  sessionId: randomUUID(),
  clientAddressHash: `smoke-${randomUUID()}`,
  watchlist: ["Confirm the starting lineup"],
  requestId: randomUUID(),
});

console.info(JSON.stringify({ gameId, outcome }, null, 2));
if (outcome.status !== "ok" || outcome.result.mode !== "live") {
  process.exitCode = 1;
}
