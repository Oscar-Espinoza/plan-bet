import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ApiFailure, ApiSuccess } from "@/lib/contracts";
import { logEvent } from "@/lib/logger";

export const apiErrorCodes = [
  "invalid_request",
  "not_found",
  "quota_exceeded",
  "unauthorized",
  "service_unavailable",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  quota_exceeded: 429,
  internal_error: 500,
  service_unavailable: 503,
};

export type RouteContext = {
  requestId: string;
  route: string;
  startedAt: number;
};

export function createRouteContext(route: string): RouteContext {
  return { requestId: randomUUID(), route, startedAt: Date.now() };
}

export function apiSuccess<T>(
  data: T,
  context: RouteContext,
  init: ResponseInit = {},
): NextResponse<ApiSuccess<T>> {
  const status = init.status ?? 200;
  logEvent("info", "api_request", {
    requestId: context.requestId,
    route: context.route,
    status,
    durationMs: Date.now() - context.startedAt,
  });
  return NextResponse.json(
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
): NextResponse<ApiFailure> {
  const status = STATUS_BY_CODE[code];
  logEvent(status >= 500 ? "error" : "warn", "api_request", {
    requestId: context.requestId,
    route: context.route,
    status,
    code,
    durationMs: Date.now() - context.startedAt,
  });
  return NextResponse.json(
    { error: { code, message, requestId: context.requestId } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
