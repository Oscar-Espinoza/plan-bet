import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTeamSchedule } from "@/data/sports-data";
import { teamSlugSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limitSchema = z.coerce.number().int().min(1).max(10).default(5);
type Props = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Props) {
  const requestId = randomUUID();
  const slug = teamSlugSchema.safeParse((await params).slug);
  const limit = limitSchema.safeParse(
    request.nextUrl.searchParams.get("limit") ?? undefined,
  );
  if (!slug.success || !limit.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "Use a configured team slug and a limit from 1 to 10.",
          requestId,
        },
      },
      { status: 400 },
    );
  }

  const schedule = await getTeamSchedule(slug.data);
  return NextResponse.json(
    {
      data: {
        ...schedule,
        games: schedule.games.slice(0, limit.data),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
