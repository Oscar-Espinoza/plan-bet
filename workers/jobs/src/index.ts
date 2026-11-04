import { WorkerEntrypoint } from "cloudflare:workers";
import type { Sport } from "../../../src/lib/server/domain/contracts";
import { enrichDueFixtures } from "../../../src/lib/server/data/fixture-context";
import { publishReadModels } from "../../../src/lib/server/data/publish";
import {
  refreshSportData,
  type RefreshOutcome,
} from "../../../src/lib/server/data/sports-data";
import { settleWagers } from "../../../src/lib/server/data/settlement";
import { getSportsProvider } from "../../../src/lib/server/providers/registry";
import { providerErrorCode } from "../../../src/lib/server/providers/provider-error";

const SPORTS: Sport[] = ["soccer", "baseball"];

async function refreshAllSports(requestId: string) {
  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    SPORTS.map((sport) => refreshSportData(sport, requestId)),
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
  const refreshed = operations.reduce(
    (total, operation) => total + operation.refreshed,
    0,
  );
  if (refreshed > 0) await publishReadModels();
  return {
    requestId,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    operations,
    summary,
  };
}

export class Jobs extends WorkerEntrypoint {
  async refresh(sport: Sport): Promise<RefreshOutcome> {
    const outcome = await refreshSportData(sport, crypto.randomUUID());
    if (outcome.refreshed > 0) await publishReadModels();
    return outcome;
  }

  async settle() {
    const requestId = crypto.randomUUID();
    return settleWagers({ requestId });
  }

  async enrich() {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    const result = await enrichDueFixtures({ requestId });
    return {
      requestId,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      ...result,
    };
  }

  async publish() {
    const startedAt = Date.now();
    await publishReadModels();
    return {
      requestId: crypto.randomUUID(),
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      status: "succeeded" as const,
    };
  }

  /** Same summary shape as GET/POST /api/cron/refresh. */
  async refreshAll() {
    return refreshAllSports(crypto.randomUUID());
  }
}

export default {
  async scheduled(event: ScheduledEvent, _env: Env, ctx: ExecutionContext) {
    const jobs = new Jobs(ctx, _env);
    if (event.cron === "5 * * * *") {
      await refreshAllSports(crypto.randomUUID());
      return;
    }
    if (event.cron === "20 * * * *") {
      await jobs.settle();
      return;
    }
    if (event.cron === "40 */3 * * *") {
      await jobs.enrich();
    }
  },
};

interface Env {
  DB: D1Database;
  PUBLIC: KVNamespace;
  CRON_SECRET?: string;
  MATCHDAY_DATA_MODE?: string;
}
