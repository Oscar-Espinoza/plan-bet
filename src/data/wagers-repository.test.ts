import { afterEach, describe, expect, it, vi } from "vitest";

const { getDatabaseMock } = vi.hoisted(() => ({ getDatabaseMock: vi.fn() }));

vi.mock("@/db/client", () => ({ getDatabase: getDatabaseMock }));

const { getRecordSlices } = await import("@/data/wagers-repository");

// Same minimal thenable-chain Proxy as src/data/credits.test.ts: every
// builder method (.from/.leftJoin/.where/.groupBy) answers itself and the
// chain resolves to a fixed row set — the query itself is exercised by the
// integration suite against a real Postgres container, not here.
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

describe("getRecordSlices", () => {
  it("counts a won soccer moneyline and a lost baseball total into different buckets, ignoring open wagers", async () => {
    // getRecordSlices issues two selects — bySport, then byMarket — over the
    // same settled-only join; the open wager described in the scenario never
    // reaches either query because `isNotNull(creditEntries.outcome)` drops
    // it before the group by, so it simply isn't part of either row set here.
    const select = vi
      .fn()
      .mockReturnValueOnce(
        chain([
          { key: "soccer", won: 1, lost: 0, voided: 0 },
          { key: "baseball", won: 0, lost: 1, voided: 0 },
        ]),
      )
      .mockReturnValueOnce(
        chain([
          {
            key: "soccer-match-result",
            label: "Match Result",
            won: 1,
            lost: 0,
            voided: 0,
          },
          {
            key: "baseball-total-8-5",
            label: "Total",
            won: 0,
            lost: 1,
            voided: 0,
          },
        ]),
      );
    getDatabaseMock.mockReturnValue({ select });

    const result = await getRecordSlices("user-1");

    expect(result.bySport).toEqual([
      { key: "soccer", label: "Soccer", won: 1, lost: 0, voided: 0 },
      { key: "baseball", label: "Baseball", won: 0, lost: 1, voided: 0 },
    ]);
    expect(result.byMarket).toEqual([
      {
        key: "soccer-match-result",
        label: "Match Result",
        won: 1,
        lost: 0,
        voided: 0,
      },
      {
        key: "baseball-total-8-5",
        label: "Total",
        won: 0,
        lost: 1,
        voided: 0,
      },
    ]);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("returns empty slices for an account with no settled wagers", async () => {
    getDatabaseMock.mockReturnValue({ select: () => chain([]) });

    const result = await getRecordSlices("user-1");

    expect(result).toEqual({ bySport: [], byMarket: [] });
  });
});
