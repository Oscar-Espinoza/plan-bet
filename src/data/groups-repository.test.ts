import { afterEach, describe, expect, it, vi } from "vitest";

const { getDatabaseMock } = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({ getDatabase: getDatabaseMock }));

const { getGroupLeaderboard } = await import("@/data/groups-repository");

// Same minimal thenable-chain Proxy as src/data/credits.test.ts.
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

describe("getGroupLeaderboard", () => {
  it("ranks members by net return, highest first", async () => {
    getDatabaseMock.mockReturnValue({
      select: () =>
        chain([
          {
            userId: "11111111-1111-4111-8111-111111111111",
            name: "Alex",
            netReturn: 40,
            wagerCount: 3,
            won: 2,
            lost: 1,
            voided: 0,
          },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            name: "Sam",
            netReturn: 120,
            wagerCount: 4,
            won: 3,
            lost: 0,
            voided: 1,
          },
          {
            userId: "33333333-3333-4333-8333-333333333333",
            name: "Jo",
            netReturn: -20,
            wagerCount: 2,
            won: 0,
            lost: 2,
            voided: 0,
          },
        ]),
    });

    const result = await getGroupLeaderboard("group-1");

    expect(result.map((entry) => entry.userId)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("returns an empty leaderboard for a group with no graded wagers", async () => {
    getDatabaseMock.mockReturnValue({ select: () => chain([]) });

    const result = await getGroupLeaderboard("group-1");

    expect(result).toEqual([]);
  });
});
