import { NextResponse } from "next/server";
import { checkDatabaseConnection, isDatabaseConfigured } from "@/db/client";
import { getRecentProviderState } from "@/data/soccer-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseConnection();
  const providerConfigured = Boolean(
    process.env.FOOTBALL_DATA_API_TOKEN?.trim(),
  );
  let recentIngestion:
    Awaited<ReturnType<typeof getRecentProviderState>> | undefined;
  if (database.status === "healthy") {
    try {
      recentIngestion = await getRecentProviderState();
    } catch {
      recentIngestion = undefined;
    }
  }
  const providerStatus = !providerConfigured
    ? "unconfigured"
    : recentIngestion?.status === "failed"
      ? "degraded"
      : "configured";
  const status =
    database.status !== "healthy"
      ? "unavailable"
      : providerStatus === "configured"
        ? "healthy"
        : "degraded";

  return NextResponse.json(
    {
      data: {
        status,
        checks: {
          app: { status: "healthy" },
          database: {
            configured: isDatabaseConfigured(),
            status: database.status,
            durationMs: database.durationMs,
          },
          footballData: {
            configured: providerConfigured,
            status: providerStatus,
            lastRunAt: recentIngestion?.startedAt?.toISOString(),
          },
        },
      },
    },
    {
      status: status === "unavailable" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
