import { timingSafeEqual } from "node:crypto";
import { refreshSportData, type RefreshOutcome } from "@/data/sports-data";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import type { Sport } from "@/lib/contracts";
import { providerErrorCode } from "@/providers/provider-error";
import { getSportsProvider } from "@/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SPORTS: Sport[] = ["soccer", "baseball"];

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch, so length-check first and let
  // both paths fall through to the same 401 — never let the length check
  // produce a different response than the content check.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function handleRefresh(request: Request) {
  const context = createRouteContext("POST /api/cron/refresh");
  const secret = process.env.CRON_SECRET?.trim();
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

  const startedAt = Date.now();
  // allSettled, not all: performSportRefresh calls seedConfiguredTeams(...) and
  // acquireRefreshLease(...) outside its try block, so a DB blip rejects the
  // promise. A bare Promise.all would let one sport's rejection fail the whole
  // run, taking the other sport's refresh down with it.
  const settled = await Promise.allSettled(
    SPORTS.map((sport) => refreshSportData(sport, context.requestId)),
  );

  const operations: RefreshOutcome[] = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const sport = SPORTS[index]!;
    return {
      sport,
      provider: getSportsProvider(sport).provider,
      status: "failed",
      errorCode: providerErrorCode(result.reason),
      refreshed: 0,
      durationMs: Date.now() - startedAt,
    };
  });

  const summary = operations.reduce(
    (acc, operation) => {
      acc[operation.status] += 1;
      return acc;
    },
    { succeeded: 0, failed: 0, skipped: 0 },
  );

  return apiSuccess(
    {
      requestId: context.requestId,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      operations,
      summary,
    },
    context,
  );
}

export const GET = handleRefresh;
export const POST = handleRefresh;
