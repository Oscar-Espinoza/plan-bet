import { NextRequest } from "next/server";
import { z } from "zod";
import { getSystemMetrics } from "@/data/system-metrics";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limitSchema = z.coerce.number().int().min(1).max(10).default(10);

export async function GET(request: NextRequest) {
  const context = createRouteContext("GET /api/system/recent");
  const limit = limitSchema.safeParse(
    request.nextUrl.searchParams.get("limit") ?? undefined,
  );
  if (!limit.success) {
    return apiFailure("invalid_request", "Use a limit from 1 to 10.", context);
  }

  return apiSuccess(await getSystemMetrics({ limit: limit.data }), context);
}
