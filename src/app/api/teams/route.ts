import { NextResponse } from "next/server";
import { getConfiguredTeams } from "@/data/sports-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { data: getConfiguredTeams() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
