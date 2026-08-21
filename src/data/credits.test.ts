import { afterEach, describe, expect, it, vi } from "vitest";

const { getDatabaseMock, withDatabaseTransactionMock } = vi.hoisted(() => ({
  getDatabaseMock: vi.fn(),
  withDatabaseTransactionMock: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: getDatabaseMock,
  withDatabaseTransaction: withDatabaseTransactionMock,
}));

const { getCreditSummary, resetBankroll, STARTING_CREDITS } =
  await import("@/data/credits");

// Same minimal thenable-chain Proxy as src/data/system-metrics.test.ts: every
// builder method (.from/.where/...) answers itself and the chain resolves to
// a fixed row set.
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

describe("getCreditSummary", () => {
  it("computes balance and net from the ledger aggregate row", async () => {
    getDatabaseMock.mockReturnValue({
      select: () =>
        chain([
          {
            balance: 500,
            lifetimeStaked: 300,
            lifetimeReturned: 100,
            resetCount: 2,
            won: 3,
            lost: 1,
            voided: 0,
          },
        ]),
    });

    const result = await getCreditSummary("user-1");

    expect(result).toEqual({
      balance: 500,
      lifetimeStaked: 300,
      lifetimeReturned: 100,
      net: -200,
      resetCount: 2,
      won: 3,
      lost: 1,
      voided: 0,
    });
  });

  it("reads 0 across every field for an account with no ledger rows", async () => {
    getDatabaseMock.mockReturnValue({ select: () => chain([]) });

    const result = await getCreditSummary("user-1");

    expect(result).toEqual({
      balance: 0,
      lifetimeStaked: 0,
      lifetimeReturned: 0,
      net: 0,
      resetCount: 0,
      won: 0,
      lost: 0,
      voided: 0,
    });
  });
});

describe("resetBankroll", () => {
  // Wires withDatabaseTransaction to hand the real work function a fake
  // transaction: the reset-count check, the balance read, and the final
  // summary read happen as three sequential `.select` calls.
  function mockTransaction(rows: {
    resetCountUsed: number;
    balance: number;
    summary: {
      balance: number;
      lifetimeStaked: number;
      lifetimeReturned: number;
      resetCount: number;
    };
  }) {
    const insertValues = vi.fn().mockReturnValue(chain([]));
    const select = vi
      .fn()
      .mockReturnValueOnce(chain([{ used: rows.resetCountUsed }]))
      .mockReturnValueOnce(chain([{ balance: rows.balance }]))
      .mockReturnValueOnce(chain([rows.summary]));
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select,
      insert: vi.fn(() => ({ values: insertValues })),
    };
    withDatabaseTransactionMock.mockImplementation(
      (work: (transaction: unknown) => unknown) => work(transaction),
    );
    return { transaction, insertValues };
  }

  it("inserts a reset row for STARTING_CREDITS minus the current balance", async () => {
    const { insertValues } = mockTransaction({
      resetCountUsed: 0,
      balance: 300,
      summary: {
        balance: STARTING_CREDITS,
        lifetimeStaked: 0,
        lifetimeReturned: 0,
        resetCount: 1,
      },
    });

    const outcome = await resetBankroll({ userId: "user-1" });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        kind: "reset",
        amount: STARTING_CREDITS - 300,
        reason: "manual_reset",
      }),
    );
    expect(outcome).toEqual({
      ok: true,
      summary: {
        balance: STARTING_CREDITS,
        lifetimeStaked: 0,
        lifetimeReturned: 0,
        net: 0,
        resetCount: 1,
        won: 0,
        lost: 0,
        voided: 0,
      },
    });
  });

  it("still inserts a reset row with amount 0 when the balance already equals the starting amount", async () => {
    const { insertValues } = mockTransaction({
      resetCountUsed: 0,
      balance: STARTING_CREDITS,
      summary: {
        balance: STARTING_CREDITS,
        lifetimeStaked: 0,
        lifetimeReturned: 0,
        resetCount: 3,
      },
    });

    await resetBankroll({ userId: "user-1" });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0 }),
    );
  });

  it("returns rate_limited and inserts nothing once the hourly cap is reached", async () => {
    const { insertValues, transaction } = mockTransaction({
      resetCountUsed: 5,
      balance: 0,
      summary: {
        balance: 0,
        lifetimeStaked: 0,
        lifetimeReturned: 0,
        resetCount: 5,
      },
    });

    const outcome = await resetBankroll({ userId: "user-1" });

    expect(outcome).toEqual({ ok: false, reason: "rate_limited" });
    expect(insertValues).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
  });
});
