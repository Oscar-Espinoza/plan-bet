import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshOutcome } from "@/data/sports-data";

vi.mock("@/data/sports-data", () => ({
  refreshSportData: vi.fn(),
}));

const { refreshSportData } = await import("@/data/sports-data");
const { GET, POST } = await import("./route");

const refreshSportDataMock = vi.mocked(refreshSportData);

function outcome(overrides: Partial<RefreshOutcome> = {}): RefreshOutcome {
  return {
    sport: "soccer",
    provider: "football-data",
    status: "succeeded",
    refreshed: 2,
    durationMs: 5,
    ...overrides,
  };
}

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/refresh", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/refresh", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    refreshSportDataMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 503 and never refreshes when CRON_SECRET is absent", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await POST(request({ authorization: "Bearer anything" }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("service_unavailable");
    expect(refreshSportDataMock).not.toHaveBeenCalled();
  });

  it("returns 401 and never refreshes when Authorization header is missing", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(refreshSportDataMock).not.toHaveBeenCalled();
  });

  it("returns 401 (not 500) for a wrong-length bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const response = await POST(request({ authorization: "Bearer short" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("unauthorized");
    expect(refreshSportDataMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a correct-length but wrong token", async () => {
    const secret = "correct-secret";
    vi.stubEnv("CRON_SECRET", secret);
    const wrongSameLength = "z".repeat(secret.length);
    const response = await POST(
      request({ authorization: `Bearer ${wrongSameLength}` }),
    );
    expect(response.status).toBe(401);
    expect(refreshSportDataMock).not.toHaveBeenCalled();
  });

  it("returns 200 with a summary and invokes both sports once with the same requestId", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    refreshSportDataMock.mockImplementation(async (sport) =>
      outcome({
        sport,
        provider: sport === "soccer" ? "football-data" : "mlb-stats",
      }),
    );

    const response = await POST(
      request({ authorization: "Bearer correct-secret" }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(refreshSportDataMock).toHaveBeenCalledTimes(2);
    const [soccerCall, baseballCall] = refreshSportDataMock.mock.calls;
    expect(soccerCall?.[0]).toBe("soccer");
    expect(baseballCall?.[0]).toBe("baseball");
    expect(soccerCall?.[1]).toBe(body.data.requestId);
    expect(baseballCall?.[1]).toBe(body.data.requestId);

    expect(body.data.summary).toEqual({ succeeded: 2, failed: 0, skipped: 0 });
    expect(body.data.operations).toHaveLength(2);
  });

  it("still returns 200 when one sport rejects, reporting it failed without blocking the other", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    refreshSportDataMock.mockImplementation(async (sport) => {
      if (sport === "soccer") throw new Error("database blip");
      return outcome({ sport: "baseball", provider: "mlb-stats" });
    });

    const response = await POST(
      request({ authorization: "Bearer correct-secret" }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    const soccerOp = body.data.operations.find(
      (op: RefreshOutcome) => op.sport === "soccer",
    );
    const baseballOp = body.data.operations.find(
      (op: RefreshOutcome) => op.sport === "baseball",
    );
    expect(soccerOp.status).toBe("failed");
    expect(soccerOp.errorCode).toBeDefined();
    expect(baseballOp.status).toBe("succeeded");
    expect(body.data.summary).toEqual({ succeeded: 1, failed: 1, skipped: 0 });
  });

  it("exposes GET as the same handler for Vercel Cron", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    refreshSportDataMock.mockImplementation(async (sport) =>
      outcome({ sport }),
    );
    const response = await GET(
      request({ authorization: "Bearer correct-secret" }),
    );
    expect(response.status).toBe(200);
  });
});
