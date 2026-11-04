import { env } from "cloudflare:workers";
import type { RequestHandler } from "./$types";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { isAuthorized } from "#lib/server/cron-auth";
import type { Sport } from "#lib/server/domain/contracts";
import type { RefreshOutcome } from "#lib/server/data/sports-data";
import { getSportsProvider } from "#lib/server/providers/registry";
import { providerErrorCode } from "#lib/server/providers/provider-error";

const SPORTS: Sport[] = ["soccer", "baseball"];

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
    const operations: RefreshOutcome[] = SPORTS.map((sport) => ({
      sport,
      provider: getSportsProvider(sport).provider,
      status: "failed",
      errorCode: providerErrorCode(error),
      refreshed: 0,
      durationMs: Date.now() - startedAt,
    }));
    return apiSuccess(
      {
        requestId: context.requestId,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        operations,
        summary: { succeeded: 0, failed: SPORTS.length, skipped: 0 },
      },
      context,
    );
  }
};

export const POST = GET;
