import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameSummary } from "@/lib/contracts";
import { HOUSE_PRICES_VERSION } from "@/lib/markets";
import { RULES_VERSION } from "@/lib/utils";

const { withDatabaseTransactionMock, readGameForWagerMock } = vi.hoisted(
  () => ({
    withDatabaseTransactionMock: vi.fn(),
    readGameForWagerMock: vi.fn(),
  }),
);

vi.mock("@/db/client", () => ({
  withDatabaseTransaction: withDatabaseTransactionMock,
}));
vi.mock("@/data/wagers-repository", () => ({
  readGameForWager: readGameForWagerMock,
  rowToWager: (
    row: Record<string, unknown>,
    settlement?: { outcome: string; returned: number; settledAt: string },
  ) => ({
    ...row,
    line: row.line ?? undefined,
    scheduledAt: (row.scheduledAt as Date).toISOString(),
    placedAt: (row.createdAt as Date).toISOString(),
    settled: Boolean(settlement),
    settlement,
  }),
}));

const { evaluateWagerAvailability, placeWager } = await import("@/data/wagers");

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

const FUTURE = "2099-01-01T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";

function makeSummary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "football-data-1-real-madrid",
    sport: "soccer",
    teamSlug: "real-madrid",
    competition: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    scheduledAt: FUTURE,
    status: "scheduled",
    ...overrides,
  };
}

describe("evaluateWagerAvailability", () => {
  it("is open for a scheduled game with no result and a future kickoff", () => {
    expect(evaluateWagerAvailability(makeSummary())).toEqual({ open: true });
  });

  it("closes on a non-scheduled status, reporting that status", () => {
    expect(
      evaluateWagerAvailability(makeSummary({ status: "postponed" })),
    ).toEqual({ open: false, reason: "postponed" });
    expect(
      evaluateWagerAvailability(makeSummary({ status: "cancelled" })),
    ).toEqual({ open: false, reason: "cancelled" });
  });

  it("closes as started once kickoff has passed, even if status still reads scheduled", () => {
    expect(
      evaluateWagerAvailability(makeSummary({ scheduledAt: PAST })),
    ).toEqual({ open: false, reason: "started" });
  });

  it("closes as finished once a result is present", () => {
    expect(
      evaluateWagerAvailability(
        makeSummary({
          result: {
            homeScore: 1,
            awayScore: 0,
            source: "test",
            observedAt: PAST,
          },
        }),
      ),
    ).toEqual({ open: false, reason: "finished" });
  });
});

describe("placeWager", () => {
  function mockTransaction(rows: {
    balance: number;
    wagerRow: Record<string, unknown>;
    summary: {
      balance: number;
      lifetimeStaked: number;
      lifetimeReturned: number;
      resetCount: number;
    };
  }) {
    const insertCreditValues = vi.fn().mockReturnValue(chain([]));
    const returning = vi.fn().mockReturnValue(chain([rows.wagerRow]));
    const insertWagerValues = vi.fn(() => ({ returning }));
    let insertCallCount = 0;
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce(chain([{ balance: rows.balance }]))
        .mockReturnValueOnce(chain([rows.summary])),
      insert: vi.fn(() => {
        insertCallCount += 1;
        return insertCallCount === 1
          ? { values: insertWagerValues }
          : { values: insertCreditValues };
      }),
    };
    withDatabaseTransactionMock.mockImplementation(
      (work: (transaction: unknown) => unknown) => work(transaction),
    );
    return { transaction, insertWagerValues, insertCreditValues };
  }

  const baseInput = {
    userId: "user-1",
    routeId: "football-data-1-real-madrid",
    marketId: "soccer-match-result",
    selectionId: "home",
    price: 2.4,
    stake: 50,
  };

  it("rejects an unknown market before touching the database", async () => {
    readGameForWagerMock.mockResolvedValue({
      canonicalId: "football-data-1",
      sport: "soccer",
      summary: makeSummary(),
    });

    const result = await placeWager({ ...baseInput, marketId: "not-a-market" });

    expect(result).toEqual({ ok: false, reason: "invalid_selection" });
    expect(withDatabaseTransactionMock).not.toHaveBeenCalled();
  });

  it("returns unavailable when the route has no games row", async () => {
    readGameForWagerMock.mockResolvedValue(undefined);

    const result = await placeWager(baseInput);

    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(withDatabaseTransactionMock).not.toHaveBeenCalled();
  });

  it("returns the closed reason for a finished game and writes nothing", async () => {
    readGameForWagerMock.mockResolvedValue({
      canonicalId: "football-data-1",
      sport: "soccer",
      summary: makeSummary({
        status: "finished",
        result: {
          homeScore: 1,
          awayScore: 0,
          source: "test",
          observedAt: PAST,
        },
      }),
    });

    const result = await placeWager(baseInput);

    expect(result).toEqual({ ok: false, reason: "closed", status: "finished" });
    expect(withDatabaseTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects a price that no longer matches the catalogue, carrying the current price", async () => {
    readGameForWagerMock.mockResolvedValue({
      canonicalId: "football-data-1",
      sport: "soccer",
      summary: makeSummary(),
    });

    const result = await placeWager({ ...baseInput, price: 999 });

    expect(result).toEqual({ ok: false, reason: "price_moved", price: 2.4 });
    expect(withDatabaseTransactionMock).not.toHaveBeenCalled();
  });

  it("rejects a stake above the balance from inside the transaction, writing nothing", async () => {
    readGameForWagerMock.mockResolvedValue({
      canonicalId: "football-data-1",
      sport: "soccer",
      summary: makeSummary(),
    });
    const { transaction } = mockTransaction({
      balance: 10,
      wagerRow: {},
      summary: {
        balance: 10,
        lifetimeStaked: 0,
        lifetimeReturned: 0,
        resetCount: 0,
      },
    });

    const result = await placeWager(baseInput); // stake 50 > balance 10

    expect(result).toEqual({ ok: false, reason: "insufficient_balance" });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("computes potentialReturn as round(stake * price) and inserts the frozen price and versions", async () => {
    readGameForWagerMock.mockResolvedValue({
      canonicalId: "football-data-1",
      sport: "soccer",
      summary: makeSummary(),
    });
    const wagerRow = {
      id: "wager-1",
      routeId: baseInput.routeId,
      canonicalGameId: "football-data-1",
      sport: "soccer",
      marketId: "soccer-match-result",
      marketLabel: "Match Result",
      selectionId: "home",
      selectionLabel: "Home",
      line: null,
      price: 2.4,
      stake: 50,
      potentialReturn: 120,
      matchup: "Barcelona at Real Madrid",
      competition: "La Liga",
      scheduledAt: new Date(FUTURE),
      pricesVersion: HOUSE_PRICES_VERSION,
      rulesVersion: RULES_VERSION,
      createdAt: new Date(),
    };
    const { insertWagerValues, insertCreditValues } = mockTransaction({
      balance: 1000,
      wagerRow,
      summary: {
        balance: 950,
        lifetimeStaked: 50,
        lifetimeReturned: 0,
        resetCount: 0,
      },
    });

    const result = await placeWager(baseInput);

    expect(insertWagerValues).toHaveBeenCalledWith(
      expect.objectContaining({
        potentialReturn: 120, // round(50 * 2.4)
        price: 2.4,
        pricesVersion: HOUSE_PRICES_VERSION,
        rulesVersion: RULES_VERSION,
      }),
    );
    expect(insertCreditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "stake",
        amount: -50,
        wagerId: "wager-1",
      }),
    );
    expect(result).toEqual({
      ok: true,
      wager: expect.objectContaining({ id: "wager-1", settled: false }),
      summary: expect.objectContaining({ balance: 950 }),
    });
  });
});
