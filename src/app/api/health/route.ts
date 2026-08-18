import { NextResponse } from "next/server";
import { checkDatabaseConnection, isDatabaseConfigured } from "@/db/client";
import { getRecentProviderState } from "@/data/sports-repository";
import { getProviderHealthDefinitions } from "@/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseConnection();
  const definitions = getProviderHealthDefinitions();
  const providerChecks = {} as Record<
    keyof typeof definitions,
    { configured: boolean; status: string; lastRunAt?: string }
  >;

  for (const [key, definition] of Object.entries(definitions) as [
    keyof typeof definitions,
    (typeof definitions)[keyof typeof definitions],
  ][]) {
    let recent: Awaited<ReturnType<typeof getRecentProviderState>> | undefined;
    if (database.status === "healthy") {
      try {
        recent = await getRecentProviderState(definition.provider);
      } catch {
        recent = undefined;
      }
    }
    providerChecks[key] = {
      configured: definition.configured,
      status: !definition.configured
        ? "unconfigured"
        : recent?.status === "failed"
          ? "degraded"
          : "configured",
      lastRunAt: recent?.startedAt?.toISOString(),
    };
  }

  const providerDegraded = Object.values(providerChecks).some(
    (check) => check.status !== "configured",
  );
  const status =
    database.status !== "healthy"
      ? "unavailable"
      : providerDegraded
        ? "degraded"
        : "healthy";

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
          ...providerChecks,
        },
      },
    },
    {
      status: status === "unavailable" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
