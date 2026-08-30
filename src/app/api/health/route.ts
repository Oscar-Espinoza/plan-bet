import { checkDatabaseConnection, isDatabaseConfigured } from "@/db/client";
import {
  getLastAiGenerationAt,
  getProviderHealthState,
} from "@/data/sports-repository";
import { apiSuccess, createRouteContext } from "@/lib/api-response";
import { getProviderHealthDefinitions } from "@/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const context = createRouteContext("GET /api/health");
  const database = await checkDatabaseConnection();
  const definitions = getProviderHealthDefinitions();
  const providerChecks = {} as Record<
    keyof typeof definitions,
    {
      configured: boolean;
      status: string;
      lastRunAt?: string;
      lastSuccessAt?: string;
      lastStatus?: string;
      lastErrorCode?: string;
      lastDurationMs?: number;
      lastGenerationAt?: string;
    }
  >;

  // Four providers x two queries each, plus the buddy lookup below, is nine
  // round trips. Health is polled by monitors and by the e2e suite, so they run
  // concurrently rather than one after another.
  const states = await Promise.all(
    (
      Object.entries(definitions) as [
        keyof typeof definitions,
        (typeof definitions)[keyof typeof definitions],
      ][]
    ).map(async ([key, definition]) => {
      if (database.status !== "healthy") return [key, undefined] as const;
      try {
        return [
          key,
          await getProviderHealthState(definition.provider),
        ] as const;
      } catch {
        return [key, undefined] as const;
      }
    }),
  );

  for (const [key, state] of states) {
    const definition = definitions[key];
    providerChecks[key] = {
      configured: definition.configured,
      status: !definition.configured
        ? "unconfigured"
        : state?.lastStatus === "failed"
          ? "degraded"
          : "configured",
      lastRunAt: state?.lastRunAt?.toISOString(),
      lastSuccessAt: state?.lastSuccessAt?.toISOString(),
      lastStatus: state?.lastStatus,
      lastErrorCode: state?.lastErrorCode,
      lastDurationMs: state?.lastDurationMs,
    };
  }

  // OpenAI never writes ingestion_runs rows (only buddy_messages), so its
  // "recency" signal is the last buddy turn instead.
  if (database.status === "healthy") {
    try {
      providerChecks.openai.lastGenerationAt =
        (await getLastAiGenerationAt())?.toISOString() ?? undefined;
    } catch {
      // leave lastGenerationAt undefined; health must stay cheap and honest
    }
  }

  const schema: "current" | "outdated" | "unknown" =
    database.status !== "healthy"
      ? "unknown"
      : database.missingTables.length > 0
        ? "outdated"
        : "current";

  const providerDegraded = Object.values(providerChecks).some(
    (check) => check.status !== "configured",
  );
  const status =
    database.status !== "healthy"
      ? "unavailable"
      : schema === "outdated" || providerDegraded
        ? "degraded"
        : "healthy";

  return apiSuccess(
    {
      status,
      checks: {
        app: { status: "healthy" },
        database: {
          configured: isDatabaseConfigured(),
          status: database.status,
          durationMs: database.durationMs,
          schema,
        },
        ...providerChecks,
      },
    },
    context,
    { status: status === "unavailable" ? 503 : 200 },
  );
}
