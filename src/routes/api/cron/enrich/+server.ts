import { env } from "cloudflare:workers";
import type { RequestHandler } from "./$types";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { isAuthorized } from "#lib/server/cron-auth";

export const GET: RequestHandler = async ({ request }) => {
  const context = createRouteContext("POST /api/cron/enrich");
  const secret = env.CRON_SECRET?.trim();
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
  if (!env.JOBS?.enrich) {
    return apiFailure(
      "service_unavailable",
      "Scheduled enrichment is not configured.",
      context,
    );
  }

  const result = await env.JOBS.enrich();

  return apiSuccess(
    {
      requestId: context.requestId,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      ...result,
    },
    context,
  );
};

export const POST = GET;
