import { enrichDueFixtures } from "@/data/fixture-context";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { isAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleEnrich(request: Request) {
  const context = createRouteContext("POST /api/cron/enrich");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return apiFailure(
      "service_unavailable",
      "Scheduled enrichment is not configured.",
      context,
    );
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return apiFailure(
      "unauthorized",
      "The scheduled enrichment request could not be authorized.",
      context,
    );
  }

  const startedAt = Date.now();
  // A locked or unconfigured run is a reported outcome, not a failure: the
  // lease is doing its job, or the arm is simply not switched on here.
  const result = await enrichDueFixtures({ requestId: context.requestId });

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

export const GET = handleEnrich;
export const POST = handleEnrich;
