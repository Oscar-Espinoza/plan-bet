import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSnapshot } from "@/lib/seed";

const mocks = vi.hoisted(() => ({
  entries: new Map<string, Promise<unknown>>(),
  read: vi.fn(),
  context: vi.fn(),
  after: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: string[]) => Promise<unknown>, keys: string[]) =>
    (...args: string[]) => {
      const key = JSON.stringify([keys, args]);
      if (!mocks.entries.has(key))
        mocks.entries.set(
          key,
          fn(...args).catch((error) => {
            mocks.entries.delete(key);
            throw error;
          }),
        );
      return mocks.entries.get(key);
    },
  revalidateTag: () => mocks.entries.clear(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/db/client", () => ({
  isDatabaseConfigured: () => true,
  getDatabase: vi.fn(),
}));
vi.mock("@/data/sports-repository", () => ({ readStoredSnapshot: mocks.read }));
vi.mock("@/data/fixture-context-repository", () => ({
  readFixtureContext: mocks.context,
}));
vi.mock("@/providers/registry", () => ({ getSportsProvider: mocks.provider }));
const { getGameDetail } = await import("./sports-data");
const { invalidatePublicSports } = await import("./public-cache");

beforeEach(() => {
  vi.stubEnv("MATCHDAY_DATA_MODE", "live");
  mocks.entries.clear();
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("public match cache", () => {
  it("reuses a stored match while deriving freshness at read time", async () => {
    const snapshot = getSnapshot("soc-rma-01")!;
    expect(snapshot).toBeDefined();
    mocks.read.mockResolvedValue({
      ...snapshot,
      freshness: {
        ...snapshot.freshness,
        mode: "live",
        expiresAt: "2000-01-01T00:00:00Z",
      },
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("1999-01-01T00:00:00Z"));
    const first = await getGameDetail("stored-game");
    vi.setSystemTime(new Date("2001-01-01T00:00:00Z"));
    const second = await getGameDetail("stored-game");
    expect(first?.snapshot.freshness.mode).toBe("live");
    expect(second?.snapshot.freshness.mode).toBe("stale");
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.after).toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
    invalidatePublicSports();
    await getGameDetail("stored-game");
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it("does not cache a missing match or refresh providers for unknown IDs", async () => {
    mocks.read.mockResolvedValue(undefined);
    expect(await getGameDetail("unknown-game")).toBeUndefined();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue(getSnapshot("soc-rma-01"));
    expect(await getGameDetail("unknown-game")).toBeDefined();
  });

  it("retries a failed database read and bypasses live cache in demo mode", async () => {
    mocks.read.mockRejectedValue(new Error("offline"));
    expect(await getGameDetail("stored-game")).toBeUndefined();
    mocks.read.mockResolvedValue(getSnapshot("soc-rma-01"));
    expect(await getGameDetail("stored-game")).toBeDefined();
    vi.stubEnv("MATCHDAY_DATA_MODE", "demo");
    expect(await getGameDetail("stored-game")).toBeUndefined();
  });
});
