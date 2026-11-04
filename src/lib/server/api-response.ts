import { logEvent } from "./logger";

export const apiErrorCodes = [
  "invalid_request",
  "not_found",
  "quota_exceeded",
  "unauthorized",
  "unauthenticated",
  "forbidden",
  "maintenance",
  "service_unavailable",
  "timeout",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  unauthenticated: 401,
  forbidden: 403,
  maintenance: 503,
  not_found: 404,
  quota_exceeded: 429,
  internal_error: 500,
  service_unavailable: 503,
  timeout: 504,
};

export type RouteContext = {
  requestId: string;
  route: string;
  startedAt: number;
};

export function createRouteContext(route: string): RouteContext {
  return { requestId: crypto.randomUUID(), route, startedAt: Date.now() };
}

export function apiSuccess<T>(
  data: T,
  context: RouteContext,
  init: ResponseInit = {},
): Response {
  const status = init.status ?? 200;
  logEvent("info", "api_request", {
    requestId: context.requestId,
    route: context.route,
    status,
    durationMs: Date.now() - context.startedAt,
  });
  return Response.json(
    { data },
    {
      ...init,
      status,
      headers: { ...init.headers, "Cache-Control": "no-store" },
    },
  );
}

export function apiFailure(
  code: ApiErrorCode,
  message: string,
  context: RouteContext,
): Response {
  const status = STATUS_BY_CODE[code];
  logEvent(status >= 500 ? "error" : "warn", "api_request", {
    requestId: context.requestId,
    route: context.route,
    status,
    code,
    durationMs: Date.now() - context.startedAt,
  });
  return Response.json(
    { error: { code, message, requestId: context.requestId } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
