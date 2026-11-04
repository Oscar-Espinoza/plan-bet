import type {
  D1Database,
  ExecutionContext,
  IncomingRequestCfProperties,
  KVNamespace,
} from "@cloudflare/workers-types";
import type { Sport } from "../lib/server/domain/contracts";
import type { RefreshOutcome } from "../lib/server/data/sports-data";

export type JobsRpcSummary = {
  requestId: string;
  startedAt: string;
  durationMs: number;
  operations: RefreshOutcome[];
  summary: { succeeded: number; failed: number; skipped: number };
};

export interface JobsBinding {
  refresh(sport: Sport): Promise<RefreshOutcome>;
  refreshAll(): Promise<JobsRpcSummary>;
  settle(): Promise<{ skipped: string }>;
  enrich(): Promise<
    | { ok: false; reason: "locked" | "unconfigured" }
    | {
        ok: true;
        runId: string;
        built: number;
        skipped: number;
        failed: number;
      }
  >;
  publish(): Promise<{
    requestId: string;
    startedAt: string;
    durationMs: number;
    status: "succeeded";
  }>;
}

declare global {
  namespace App {
    interface Locals {
      /** `en` or `es`, from the locale cookie, else Accept-Language. */
      locale: "en" | "es";
      /** IANA zone: tz cookie, else request.cf.timezone, else UTC. */
      zone: string;
      /** The request's own Date.now(), captured once in hooks. */
      requestTime: number;
      /** Filled by T07. Stubbed as null until then. */
      user: null;
      /**
       * True when a Better Auth session cookie is present, whether or not
       * the token is valid. Presence alone bypasses the shared HTML cache.
       */
      signedIn: boolean;
    }
    interface Platform {
      env: {
        DB: D1Database;
        PUBLIC: KVNamespace;
        JOBS?: JobsBinding;
        CRON_SECRET?: string;
        BETTER_AUTH_SECRET?: string;
        MATCHDAY_DATA_MODE?: string;
        MATCHDAY_MAINTENANCE?: string;
        PUBLIC_SITE_URL?: string;
      };
      ctx: ExecutionContext;
      cf?: IncomingRequestCfProperties;
    }
  }
}

export {};
