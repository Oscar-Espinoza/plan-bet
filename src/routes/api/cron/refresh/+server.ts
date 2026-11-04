import { env } from "cloudflare:workers";
import type { RequestHandler } from "./$types";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { isAuthorized } from "#lib/server/cron-auth";
import { logEvent } from "#lib/server/logger";
import { providerErrorCode } from "#lib/server/providers/provider-error";

export const GET: RequestHandler = async ({ request }) => {
  const context = createRouteContext("POST /api/cron/refresh");
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return apiFailure(
      "service_unavailable",
      "Scheduled refresh is not configured.",
      context,
    );
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return apiFailure(
      "unauthorized",
      "The scheduled refresh request could not be authorized.",
      context,
    );
  }

  if (!env.JOBS?.refreshAll) {
    return apiFailure(
      "service_unavailable",
      "Scheduled refresh is not configured.",
      context,
    );
  }

  const startedAt = Date.now();
  try {
    const body = await env.JOBS.refreshAll();
    return apiSuccess(body, context);
  } catch (error) {
    logEvent("error", "api_request", {
      requestId: context.requestId,
      route: context.route,
      status: 500,
      code: "internal_error",
      errorCode: providerErrorCode(error),
      durationMs: Date.now() - startedAt,
    });
    return apiFailure(
      "internal_error",
      "The scheduled refresh request could not complete.",
      context,
    );
  }
};

export const POST = GET;
