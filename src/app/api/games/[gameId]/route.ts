import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getGameDetail } from "@/data/sports-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ gameId: string }> };

export async function GET(_: Request, { params }: Props) {
  const requestId = randomUUID();
  const gameId = (await params).gameId.trim();
  if (!gameId || gameId.length > 160) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "The game ID is invalid.",
          requestId,
        },
      },
      { status: 400 },
    );
  }
  const detail = await getGameDetail(gameId);
  if (!detail) {
    return NextResponse.json(
      {
        error: {
          code: "not_found",
          message: "The requested game was not found.",
          requestId,
        },
      },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { data: detail.snapshot },
    { headers: { "Cache-Control": "no-store" } },
  );
}
