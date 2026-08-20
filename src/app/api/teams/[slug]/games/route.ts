import { NextRequest } from "next/server";
import { z } from "zod";
import { getTeamSchedule } from "@/data/sports-data";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { teamSlugSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limitSchema = z.coerce.number().int().min(1).max(10).default(5);
type Props = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Props) {
  const context = createRouteContext("GET /api/teams/[slug]/games");
  const slug = teamSlugSchema.safeParse((await params).slug);
  const limit = limitSchema.safeParse(
    request.nextUrl.searchParams.get("limit") ?? undefined,
  );
  if (!slug.success || !limit.success) {
    return apiFailure(
      "invalid_request",
      "Use a configured team slug and a limit from 1 to 10.",
      context,
    );
  }

  const schedule = await getTeamSchedule(slug.data, {
    requestId: context.requestId,
  });
  return apiSuccess(
    {
      ...schedule,
      games: schedule.games.slice(0, limit.data),
    },
    context,
  );
}
