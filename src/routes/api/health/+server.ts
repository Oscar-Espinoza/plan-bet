import { env } from "cloudflare:workers";
import type { RequestHandler } from "./$types";

const headers = { "Cache-Control": "no-store" };

export const GET: RequestHandler = async ({ platform }) => {
  // adapter-cloudflare 8 does not pass `platform` into server.respond.
  // Bindings are on `cloudflare:workers` `env` (see the adapter docs).
  const db = platform?.env?.DB ?? env.DB;
  if (!db) {
    return Response.json(
      {
        data: {
          status: "unconfigured",
          database: { status: "unconfigured", durationMs: 0 },
        },
      },
      { status: 200, headers },
    );
  }

  const started = performance.now();
  try {
    await db.prepare("select 1").run();
    return Response.json(
      {
        data: {
          status: "healthy",
          database: {
            status: "healthy",
            durationMs: Math.round(performance.now() - started),
          },
        },
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        data: {
          status: "unavailable",
          database: {
            status: "unavailable",
            durationMs: Math.round(performance.now() - started),
          },
        },
      },
      { status: 200, headers },
    );
  }
};
