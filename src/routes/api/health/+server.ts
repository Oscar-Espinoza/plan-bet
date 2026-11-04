import { env } from "cloudflare:workers";
import type { RequestHandler } from "./$types";
import {
  checkDatabaseConnection,
  isDatabaseConfigured,
} from "#lib/server/db/client";
import { PUBLISH_LAST_AT_KEY } from "#lib/server/data/publish";
import {
  getLastAiGenerationAt,
  getProviderHealthState,
} from "#lib/server/data/sports-repository";
import { apiSuccess, createRouteContext } from "#lib/server/api-response";
import { getProviderHealthDefinitions } from "#lib/server/providers/registry";

const headers = { "Cache-Control": "no-store" };

export const GET: RequestHandler = async () => {
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
      lastDurationMs: state?.lastDurationMs ?? undefined,
    };
  }

  if (database.status === "healthy") {
    try {
      providerChecks.openai.lastGenerationAt =
        (await getLastAiGenerationAt())?.toISOString() ?? undefined;
    } catch {
      // leave lastGenerationAt undefined
    }
  }

  const schema: "current" | "outdated" | "unknown" =
    database.status !== "healthy"
      ? "unknown"
      : database.missingTables.length > 0 ||
          (database.pendingMigrations ?? 0) > 0
        ? "outdated"
        : database.pendingMigrations === null
          ? "unknown"
          : "current";

  const providerDegraded = Object.values(providerChecks).some(
    (check) => check.status !== "configured",
  );
  const status =
    database.status !== "healthy"
      ? "unavailable"
      : schema !== "current" || providerDegraded
        ? "degraded"
        : "healthy";

  const version = (await env.PUBLIC?.get("publish:version"))?.trim() || "0";
  const lastPublishedAt =
    (await env.PUBLIC?.get(PUBLISH_LAST_AT_KEY)) ?? undefined;

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
          missingTables: database.missingTables.length,
          pendingMigrations: database.pendingMigrations,
        },
        ...providerChecks,
      },
      publish: {
        version,
        lastPublishedAt,
      },
    },
    context,
    {
      status: status === "unavailable" ? 503 : 200,
      headers,
    },
  );
};
