import { settleWagers } from "@/data/settlement";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { isAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleSettle(request: Request) {
  const context = createRouteContext("POST /api/cron/settle");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return apiFailure(
      "service_unavailable",
      "Scheduled settlement is not configured.",
      context,
    );
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return apiFailure(
      "unauthorized",
      "The scheduled settlement request could not be authorized.",
      context,
    );
  }

  const startedAt = Date.now();
  const result = await settleWagers({ requestId: context.requestId });

  return apiSuccess(
    {
      requestId: context.requestId,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      ...result,
    },
    context,
  );
}

export const GET = handleSettle;
export const POST = handleSettle;
