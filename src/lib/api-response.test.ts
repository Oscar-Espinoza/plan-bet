import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorCodes,
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "@/lib/api-response";

const STATUS_BY_CODE: Record<(typeof apiErrorCodes)[number], number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  quota_exceeded: 429,
  internal_error: 500,
  service_unavailable: 503,
};

describe("api-response", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps every error code to its documented status", async () => {
    for (const code of apiErrorCodes) {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const context = createRouteContext("GET /api/example");
      const response = apiFailure(code, "boom", context);
      expect(response.status).toBe(STATUS_BY_CODE[code]);
      const body = await response.json();
      expect(body).toEqual({
        error: { code, message: "boom", requestId: context.requestId },
      });
      vi.restoreAllMocks();
    }
  });

  it("sets Cache-Control: no-store on both success and failure", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const successContext = createRouteContext("GET /api/example");
    const success = apiSuccess({ ok: true }, successContext);
    expect(success.headers.get("Cache-Control")).toBe("no-store");

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failureContext = createRouteContext("GET /api/example");
    const failure = apiFailure("not_found", "missing", failureContext);
    expect(failure.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps the body shape byte-identical: { data } and { error: { code, message, requestId } }", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const context = createRouteContext("GET /api/example");
    const success = apiSuccess({ foo: "bar" }, context);
    expect(await success.json()).toEqual({ data: { foo: "bar" } });

    vi.spyOn(console, "error").mockImplementation(() => {});
    const failureContext = createRouteContext("GET /api/example");
    const failure = apiFailure("internal_error", "oops", failureContext);
    expect(await failure.json()).toEqual({
      error: {
        code: "internal_error",
        message: "oops",
        requestId: failureContext.requestId,
      },
    });
  });

  it("emits exactly one log line per response", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    apiSuccess({ ok: true }, createRouteContext("GET /api/example"));
    expect(infoSpy).toHaveBeenCalledTimes(1);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiFailure("not_found", "missing", createRouteContext("GET /api/example"));
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    apiFailure(
      "internal_error",
      "oops",
      createRouteContext("GET /api/example"),
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("logs 4xx failures at warn and 5xx failures at error", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    apiFailure("invalid_request", "bad", createRouteContext("GET /x"));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();

    apiFailure("service_unavailable", "down", createRouteContext("GET /x"));
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("allows init to add extra headers on success without dropping Cache-Control", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const response = apiSuccess(
      { ok: true },
      createRouteContext("GET /api/example"),
      { headers: { "X-Custom": "yes" }, status: 503 },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Custom")).toBe("yes");
  });
});
