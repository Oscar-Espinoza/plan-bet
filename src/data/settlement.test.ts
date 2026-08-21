import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameSummary } from "@/lib/contracts";

const { getDatabaseMock, acquireRefreshLeaseMock, completeRefreshLeaseMock } =
  vi.hoisted(() => ({
    getDatabaseMock: vi.fn(),
    acquireRefreshLeaseMock: vi.fn(),
    completeRefreshLeaseMock: vi.fn(),
  }));

vi.mock("@/db/client", () => ({ getDatabase: getDatabaseMock }));
vi.mock("@/data/sports-repository", () => ({
  acquireRefreshLease: acquireRefreshLeaseMock,
  completeRefreshLease: completeRefreshLeaseMock,
}));

const { gradeCredits, settleWagers } = await import("@/data/settlement");

// Same minimal thenable-chain Proxy as src/data/credits.test.ts: every
// builder method (.from/.where/.leftJoin/...) answers itself and the chain
// resolves to a fixed row set when awaited.
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

function finishedSummary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "football-data-1-real-madrid",
    sport: "soccer",
    teamSlug: "real-madrid",
    competition: "La Liga",
    homeTeam: "Real Madrid",
    awayTeam: "Barcelona",
    scheduledAt: "2026-08-20T20:00:00.000Z",
    status: "finished",
    result: {
      homeScore: 2,
      awayScore: 1,
      completion: "regulation",
      source: "test",
      observedAt: "2026-08-20T22:00:00.000Z",
    },
    ...overrides,
  };
}

const LEASE = { id: "run-1", startedAt: new Date("2026-08-21T06:30:00.000Z") };

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "wager-1",
    userId: "user-1",
    sport: "soccer",
    marketId: "soccer-match-result",
    selectionId: "home", // Real Madrid (home) wins the finishedSummary fixture
    stake: 50,
    potentialReturn: 120,
    summary: finishedSummary(),
    ...overrides,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("gradeCredits", () => {
  const wager = { potentialReturn: 120, stake: 50 };

  it("won returns the frozen potential return", () => {
    expect(gradeCredits("won", wager)).toBe(120);
  });

  it("void returns the stake back", () => {
    expect(gradeCredits("void", wager)).toBe(50);
  });

  it("lost returns 0", () => {
    expect(gradeCredits("lost", wager)).toBe(0);
  });
});

describe("settleWagers", () => {
  it("returns locked without ever selecting a candidate when the lease is already claimed", async () => {
    acquireRefreshLeaseMock.mockResolvedValue(undefined);

    const result = await settleWagers({ requestId: "req-1" });

    expect(result).toEqual({ ok: false, reason: "locked" });
    expect(getDatabaseMock).not.toHaveBeenCalled();
    expect(completeRefreshLeaseMock).not.toHaveBeenCalled();
  });

  it("settles a winning wager, tallies it, and closes the lease as succeeded", async () => {
    acquireRefreshLeaseMock.mockResolvedValue(LEASE);
    const insert = vi.fn().mockReturnValueOnce(chain([{ id: "credit-1" }]));
    getDatabaseMock.mockReturnValue({
      select: () => chain([candidate()]),
      insert,
    });
    completeRefreshLeaseMock.mockResolvedValue(undefined);

    const result = await settleWagers({ requestId: "req-1" });

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      settled: 1,
      skipped: 0,
      failed: 0,
      byOutcome: { won: 1, lost: 0, void: 0 },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(completeRefreshLeaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1", status: "succeeded" }),
    );
  });

  it("does not let one throwing wager stop the rest of the run", async () => {
    acquireRefreshLeaseMock.mockResolvedValue(LEASE);
    const unresolvable = candidate({
      id: "wager-broken",
      marketId: "not-a-market", // resolveSelection returns undefined -> throws
    });
    const winner = candidate({ id: "wager-1" });
    const insert = vi.fn().mockReturnValueOnce(chain([{ id: "credit-1" }]));
    getDatabaseMock.mockReturnValue({
      select: () => chain([unresolvable, winner]),
      insert,
    });

    const result = await settleWagers({ requestId: "req-1" });

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      settled: 1,
      skipped: 0,
      failed: 1,
      byOutcome: { won: 1, lost: 0, void: 0 },
    });
    // Only the winning wager ever reaches the insert step.
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("skips a scheduled game with no result rather than voiding it", async () => {
    acquireRefreshLeaseMock.mockResolvedValue(LEASE);
    const open = candidate({
      summary: finishedSummary({ status: "scheduled", result: undefined }),
    });
    const insert = vi.fn();
    getDatabaseMock.mockReturnValue({
      select: () => chain([open]),
      insert,
    });

    const result = await settleWagers({ requestId: "req-1" });

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      settled: 0,
      skipped: 1,
      failed: 0,
      byOutcome: { won: 0, lost: 0, void: 0 },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("treats a conflict-do-nothing insert (already settled) as skipped, not settled", async () => {
    acquireRefreshLeaseMock.mockResolvedValue(LEASE);
    const insert = vi.fn().mockReturnValueOnce(chain([])); // no row returned
    getDatabaseMock.mockReturnValue({
      select: () => chain([candidate()]),
      insert,
    });

    const result = await settleWagers({ requestId: "req-1" });

    expect(result).toEqual({
      ok: true,
      runId: "run-1",
      settled: 0,
      skipped: 1,
      failed: 0,
      byOutcome: { won: 0, lost: 0, void: 0 },
    });
  });

  it("closes the lease as failed and rethrows when the candidate query itself throws", async () => {
    acquireRefreshLeaseMock.mockResolvedValue(LEASE);
    getDatabaseMock.mockReturnValue({
      select: () => {
        throw new Error("connection reset");
      },
      insert: vi.fn(),
    });

    await expect(settleWagers({ requestId: "req-1" })).rejects.toThrow(
      "connection reset",
    );

    expect(completeRefreshLeaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1", status: "failed" }),
    );
  });
});
