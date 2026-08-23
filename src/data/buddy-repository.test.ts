import { afterEach, describe, expect, it, vi } from "vitest";

const { getDatabaseMock } = vi.hoisted(() => ({ getDatabaseMock: vi.fn() }));

vi.mock("@/db/client", () => ({ getDatabase: getDatabaseMock }));

const { saveBuddyNote } = await import("@/data/buddy-repository");

// Same minimal thenable-chain Proxy as src/data/wagers-repository.test.ts:
// every builder method answers itself and the chain resolves to a fixed row
// set — the real query is exercised by the integration suite against a real
// Postgres container, not here.
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

describe("saveBuddyNote", () => {
  it("skips the insert when the same note is already stored for that session", async () => {
    const insert = vi.fn().mockReturnValue(chain());
    getDatabaseMock.mockReturnValue({
      select: () => chain([{ id: "existing" }]),
      insert,
    });

    await saveBuddyNote({
      sessionHash: "session-1",
      note: "swears a lot, roots for Madrid",
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts a note not already stored for that session", async () => {
    const insert = vi.fn().mockReturnValue(chain());
    getDatabaseMock.mockReturnValue({
      select: () => chain([]),
      insert,
    });

    await saveBuddyNote({
      sessionHash: "session-1",
      note: "swears a lot, roots for Madrid",
    });

    expect(insert).toHaveBeenCalled();
  });
});
