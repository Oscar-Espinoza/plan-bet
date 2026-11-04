import { env } from "cloudflare:workers";
import type { RequestHandler } from "./$types";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { isAuthorized } from "#lib/server/cron-auth";
import { JobsTimeoutError, withTimeout } from "#lib/server/jobs-timeout";
import { logEvent } from "#lib/server/logger";
import { providerErrorCode } from "#lib/server/providers/provider-error";

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

  try {
    const result = await withTimeout(env.JOBS.enrich(), 280_000);
    return apiSuccess(
      {
        requestId: context.requestId,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        ...result,
      },
      context,
    );
  } catch (error) {
    if (error instanceof JobsTimeoutError) {
      logEvent("error", "api_request", {
        requestId: context.requestId,
        route: context.route,
        status: 504,
        code: "timeout",
        errorCode: "timeout",
        durationMs: Date.now() - startedAt,
      });
      return apiFailure(
        "timeout",
        "The scheduled enrichment request timed out.",
        context,
      );
    }
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
      "The scheduled enrichment request could not complete.",
      context,
    );
  }
};

export const POST = GET;
