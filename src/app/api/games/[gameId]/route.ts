import { getGameDetail } from "@/data/sports-data";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ gameId: string }> };

export async function GET(_: Request, { params }: Props) {
  const context = createRouteContext("GET /api/games/[gameId]");
  const gameId = (await params).gameId.trim();
  if (!gameId || gameId.length > 160) {
    return apiFailure("invalid_request", "The game ID is invalid.", context);
  }
  const detail = await getGameDetail(gameId, { requestId: context.requestId });
  if (!detail) {
    return apiFailure(
      "not_found",
      "The requested game was not found.",
      context,
    );
  }
  return apiSuccess(detail.snapshot, context);
}
