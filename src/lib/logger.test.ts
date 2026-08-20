import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent, redact } from "@/lib/logger";

function lastLine(spy: ReturnType<typeof vi.spyOn>) {
  expect(spy).toHaveBeenCalledTimes(1);
  const [line] = spy.mock.calls[0] as [string];
  expect(line).not.toContain("\n");
  return JSON.parse(line);
}

describe("logEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts denylisted keys, including nested and snake/kebab-case spellings", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEvent("info", "test_event", {
      token: "abc",
      api_key: "def",
      "session-id": "ghi",
      nested: { password: "hunter2", list: [{ Cookie: "yum" }] },
    });
    const parsed = lastLine(spy);
    expect(parsed.token).toBe("[redacted]");
    expect(parsed.api_key).toBe("[redacted]");
    expect(parsed["session-id"]).toBe("[redacted]");
    expect(parsed.nested.password).toBe("[redacted]");
    expect(parsed.nested.list[0].Cookie).toBe("[redacted]");
  });

  it("scrubs configured secret env values embedded inside longer strings", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pw@host/db");
    vi.stubEnv("FOOTBALL_DATA_API_TOKEN", "fd-token-123");
    vi.stubEnv("OPENAI_API_KEY", "sk-opsecret");
    vi.stubEnv("RATE_LIMIT_HASH_SECRET", "rl-secret-xyz");
    vi.stubEnv("CRON_SECRET", "cron-secret-abc");

    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEvent("info", "test_event", {
      message: "failed to reach https://x?token=fd-token-123",
      details: `db=postgres://user:pw@host/db key=sk-opsecret rl=rl-secret-xyz cron=cron-secret-abc`,
    });
    const parsed = lastLine(spy);
    expect(parsed.message).not.toContain("fd-token-123");
    expect(parsed.message).toContain("[redacted]");
    expect(parsed.details).not.toContain("postgres://user:pw@host/db");
    expect(parsed.details).not.toContain("sk-opsecret");
    expect(parsed.details).not.toContain("rl-secret-xyz");
    expect(parsed.details).not.toContain("cron-secret-abc");

    vi.unstubAllEnvs();
  });

  it("emits exactly one call and one line", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEvent("info", "test_event", { a: 1 });
    lastLine(spy);
  });

  it("always includes timestamp, level, and event, matching the console method used", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEvent("info", "info_event", {});
    const infoParsed = lastLine(infoSpy);
    expect(infoParsed.level).toBe("info");
    expect(infoParsed.event).toBe("info_event");
    expect(typeof infoParsed.timestamp).toBe("string");
    expect(new Date(infoParsed.timestamp).toString()).not.toBe("Invalid Date");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logEvent("warn", "warn_event", {});
    expect(lastLine(warnSpy).level).toBe("warn");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logEvent("error", "error_event", {});
    expect(lastLine(errorSpy).level).toBe("error");
  });

  it("does not throw on a cyclic object, an Error, a Date, a bigint, or a function", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const cyclic: Record<string, unknown> = { name: "cycle" };
    cyclic.self = cyclic;

    expect(() =>
      logEvent("info", "weird_payload", {
        cyclic,
        error: new Error("boom"),
        date: new Date("2030-01-01T00:00:00.000Z"),
        big: BigInt(10),
        fn: () => "nope",
      }),
    ).not.toThrow();

    const parsed = lastLine(spy);
    expect(parsed.cyclic.self).toBe("[circular]");
    expect(parsed.error).toEqual({ name: "Error", message: "boom" });
    expect(parsed.date).toBe("2030-01-01T00:00:00.000Z");
    expect(parsed.big).toBe("10");
    expect(parsed.fn).toBe("[unserializable]");
  });

  it("scrubs a secret embedded in an Error message", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:hunter2@db.example/app");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logEvent("warn", "persistence_failed", {
      error: new Error(
        "connect ECONNREFUSED postgresql://user:hunter2@db.example/app",
      ),
    });

    const parsed = lastLine(spy);
    expect(parsed.error.message).toBe("connect ECONNREFUSED [redacted]");
    expect(JSON.stringify(parsed)).not.toContain("hunter2");
  });

  it("redacts the briefing hash fields the audit table must never expose", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logEvent("info", "briefing_generation", {
      requestId: "req-1",
      sessionHash: "0f3c",
      ip_hash: "9b21",
      inputHash: "aa77",
      clientAddressHash: "cc12",
      run: { sessionHash: "nested-0f3c" },
    });

    const parsed = lastLine(spy);
    expect(parsed.sessionHash).toBe("[redacted]");
    expect(parsed.ip_hash).toBe("[redacted]");
    expect(parsed.inputHash).toBe("[redacted]");
    expect(parsed.clientAddressHash).toBe("[redacted]");
    expect(parsed.run.sessionHash).toBe("[redacted]");
    expect(parsed.requestId).toBe("req-1");
  });

  it("passes through a field that is not denylisted and contains no secret", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logEvent("info", "test_event", { status: "succeeded", count: 3 });
    const parsed = lastLine(spy);
    expect(parsed.status).toBe("succeeded");
    expect(parsed.count).toBe(3);
  });
});

describe("redact", () => {
  it("bounds recursion depth", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 10; i++) {
      const next: Record<string, unknown> = {};
      cursor.child = next;
      cursor = next;
    }
    const result = JSON.stringify(redact(deep));
    expect(result).toContain("[truncated]");
  });
});
