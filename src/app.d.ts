import type {
  D1Database,
  ExecutionContext,
  IncomingRequestCfProperties,
  KVNamespace,
} from "@cloudflare/workers-types";

declare global {
  namespace App {
    interface Platform {
      env: {
        DB: D1Database;
        PUBLIC: KVNamespace;
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
