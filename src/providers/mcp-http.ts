import "server-only";

import { ProviderError } from "@/providers/provider-error";

/**
 * Two of this app's context sources (apifootball, BigBalls) are published as
 * remote MCP servers rather than plain REST APIs. MCP over streamable HTTP is
 * just JSON-RPC in a POST body, so one `fetch` wrapper reaches both — no SDK,
 * no session handshake, and the servers' own normalization comes along for
 * free (apifootball's raw REST reports kickoff times in an unreliable zone;
 * its MCP layer computes a correct `kickoff_utc`).
 */
export type McpServer = {
  url: string;
  token: string;
};

export type McpCallOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

/**
 * Some MCP servers (apifootball) reject a bare `tools/call` until the client has
 * run the `initialize` handshake and echoes the session id it hands back; others
 * (BigBalls) answer without one. Rather than pay a round trip everywhere, the
 * session is opened lazily — only after a server has actually asked for it — and
 * cached per URL for the life of the process.
 *
 * ponytail: a module-level map, not a pool. Sessions are cheap to re-open and a
 * server restart just costs one retry.
 */
const sessions = new Map<string, string>();

const DEFAULT_TIMEOUT_MS = 20_000;
// A 15-day fixture sweep is the largest thing either server returns, well under
// a megabyte. The ceiling exists to bound a misbehaving server, not to fit a
// known payload.
const DEFAULT_MAX_RESPONSE_BYTES = 4_000_000;

/**
 * Reads one server's URL and token out of the environment. A server with either
 * half missing is simply unconfigured — the caller degrades to no enrichment
 * rather than throwing, the same contract `FOOTBALL_DATA_API_TOKEN` has.
 */
export function readMcpServer(
  urlVar: string,
  tokenVar: string,
): McpServer | undefined {
  const url = process.env[urlVar]?.trim();
  const token = process.env[tokenVar]?.trim();
  if (!url || !token) return undefined;
  return { url, token };
}

/**
 * MCP servers may answer a POST with either a JSON body or a one-frame SSE
 * stream, depending on what the client advertised. Both carry the same
 * JSON-RPC envelope, so the SSE arm just pulls the payload out of `data:`.
 */
function parseBody(contentType: string, raw: string, operation: string) {
  const json = contentType.includes("text/event-stream")
    ? raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : raw;

  if (!json) {
    throw new ProviderError(
      "invalid_payload",
      "MCP server returned an empty body",
      operation,
    );
  }

  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new ProviderError(
      "invalid_payload",
      "MCP server returned a body that is not JSON",
      operation,
    );
  }
}

type JsonRpcEnvelope = {
  error?: { code?: number; message?: string };
  result?: {
    isError?: boolean;
    content?: { type?: string; text?: string }[];
    structuredContent?: unknown;
  };
};

/**
 * Calls one tool and returns its result already parsed out of the MCP content
 * envelope. Tools on both servers answer with a single text block holding JSON,
 * so that block is parsed; a server that sends `structuredContent` is preferred
 * when present. The caller validates the shape with Zod — this only unwraps.
 */
async function send(
  server: McpServer,
  body: unknown,
  options: McpCallOptions,
  operation: string,
) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const sessionId = sessions.get(server.url);
  try {
    return await fetcher(server.url, {
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${server.token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ProviderError(
      timedOut ? "timeout" : "unavailable",
      timedOut
        ? "MCP request timed out"
        : "MCP request could not reach the server",
      operation,
    );
  }
}

/** `initialize`, then the `notifications/initialized` the spec requires before any call. */
async function openSession(
  server: McpServer,
  options: McpCallOptions,
  operation: string,
) {
  sessions.delete(server.url);
  const response = await send(
    server,
    {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "matchday-plan", version: "1" },
      },
    },
    options,
    operation,
  );
  const sessionId = response.headers.get("mcp-session-id");
  await response.text();
  if (!response.ok || !sessionId) {
    throw new ProviderError(
      response.status === 401 || response.status === 403
        ? "unauthorized"
        : "unavailable",
      `MCP handshake failed with ${response.status}`,
      operation,
    );
  }
  sessions.set(server.url, sessionId);
  await send(
    server,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    options,
    operation,
  );
}

export async function callMcpTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
  options: McpCallOptions = {},
): Promise<unknown> {
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const operation = `mcp:${name}`;
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  };

  let response = await send(server, request, options, operation);

  // A 400 here means the server wants a session (or the cached one expired).
  // Open one and retry exactly once; a second failure is a real error.
  if (response.status === 400) {
    await response.text();
    await openSession(server, options, operation);
    response = await send(server, request, options, operation);
  }

  if (!response.ok) {
    throw new ProviderError(
      response.status === 401 || response.status === 403
        ? "unauthorized"
        : response.status === 429
          ? "rate_limited"
          : "unavailable",
      `MCP server responded ${response.status}`,
      operation,
    );
  }

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new ProviderError(
      "invalid_payload",
      "MCP response exceeded the size ceiling",
      operation,
    );
  }

  const raw = await response.text();
  if (raw.length > maxBytes) {
    throw new ProviderError(
      "invalid_payload",
      "MCP response exceeded the size ceiling",
      operation,
    );
  }

  const envelope = parseBody(
    response.headers.get("content-type") ?? "",
    raw,
    operation,
  ) as JsonRpcEnvelope;

  if (envelope.error) {
    throw new ProviderError(
      "unavailable",
      `MCP server reported ${envelope.error.message ?? "an error"}`,
      operation,
    );
  }

  const result = envelope.result;
  if (!result) {
    throw new ProviderError(
      "invalid_payload",
      "MCP response carried no result",
      operation,
    );
  }

  if (result.isError) {
    const text = result.content?.[0]?.text ?? "an unspecified tool error";
    throw new ProviderError(
      "unavailable",
      `MCP tool reported ${text.slice(0, 200)}`,
      operation,
    );
  }

  if (result.structuredContent !== undefined) return result.structuredContent;

  const text = result.content?.find((part) => part.type === "text")?.text;
  if (text === undefined) {
    throw new ProviderError(
      "invalid_payload",
      "MCP tool result carried no text content",
      operation,
    );
  }

  // Some tools prefix a human-readable line before the JSON ("19 match(es).\n[…]").
  const start = text.search(/[[{]/);
  if (start < 0) return text;
  try {
    return JSON.parse(text.slice(start)) as unknown;
  } catch {
    return text;
  }
}
