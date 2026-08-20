import { afterEach, describe, expect, it, vi } from "vitest";

const { isDatabaseConfiguredMock, getDatabaseMock } = vi.hoisted(() => ({
  isDatabaseConfiguredMock: vi.fn(),
  getDatabaseMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  isDatabaseConfigured: isDatabaseConfiguredMock,
  getDatabase: getDatabaseMock,
}));

const { getSystemMetrics } = await import("@/data/system-metrics");

// A minimal thenable chain that answers every drizzle builder method
// (.from/.where/.groupBy/.orderBy/.limit) with itself and resolves to a
// fixed row set — enough to exercise getSystemMetrics without a real DB.
function chain(rows: unknown[] = []) {
  const promise = Promise.resolve(rows);
  const handler: ProxyHandler<() => void> = {
    get(_target, prop) {
      if (prop === "then") return promise.then.bind(promise);
      if (prop === "catch") return promise.catch.bind(promise);
      if (prop === "finally") return promise.finally.bind(promise);
      return () => proxy;
    },
  };
  const proxy: unknown = new Proxy(() => undefined, handler);
  return proxy;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("getSystemMetrics", () => {
  it("returns unconfigured without querying the database", async () => {
    isDatabaseConfiguredMock.mockReturnValue(false);

    const result = await getSystemMetrics();

    expect(result).toEqual({ available: false, reason: "unconfigured" });
    expect(getDatabaseMock).not.toHaveBeenCalled();
  });

  it("returns unavailable when a query throws", async () => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    getDatabaseMock.mockImplementation(() => {
      throw new Error("connection reset");
    });

    const result = await getSystemMetrics();

    expect(result).toEqual({ available: false, reason: "unavailable" });
  });

  it("clamps limit to the 1-10 range", async () => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    getDatabaseMock.mockReturnValue({ select: () => chain([]) });

    const tooHigh = await getSystemMetrics({ limit: 999 });
    const tooLow = await getSystemMetrics({ limit: -5 });
    const zero = await getSystemMetrics({ limit: 0 });

    expect(tooHigh).toMatchObject({ available: true, limit: 10 });
    expect(tooLow).toMatchObject({ available: true, limit: 1 });
    expect(zero).toMatchObject({ available: true, limit: 1 });
  });

  it("defaults to a 10-row limit and a 24h window", async () => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    getDatabaseMock.mockReturnValue({ select: () => chain([]) });

    const result = await getSystemMetrics();

    expect(result).toMatchObject({
      available: true,
      limit: 10,
      windowHours: 24,
      ingestion: { recent: [], byProvider: [] },
      briefings: { total: 0, latencyMs: null, errors: [] },
      freshness: [],
    });
  });
});
