import { apiSuccess, createRouteContext } from "@/lib/api-response";
import { getConfiguredTeams } from "@/data/sports-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const context = createRouteContext("GET /api/teams");
  return apiSuccess(getConfiguredTeams(), context);
}
