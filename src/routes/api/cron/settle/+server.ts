import { env } from "cloudflare:workers";
import type { RequestHandler } from "./$types";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { isAuthorized } from "#lib/server/cron-auth";

export const GET: RequestHandler = async ({ request }) => {
  const context = createRouteContext("POST /api/cron/settle");
  const secret = env.CRON_SECRET?.trim();
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
  const result = env.JOBS?.settle
    ? await env.JOBS.settle()
    : { skipped: "settlement arrives in T09" as const };

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
