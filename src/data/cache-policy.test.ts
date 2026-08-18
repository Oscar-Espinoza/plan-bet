import { describe, expect, it } from "vitest";
import { modeForExpiry } from "@/data/cache-policy";

describe("cache policy", () => {
  const now = new Date("2026-08-17T12:00:00Z");

  it("treats a future expiry as live", () => {
    expect(modeForExpiry("2026-08-17T12:00:01Z", now)).toBe("live");
  });

  it("treats expired and missing expiry values as stale", () => {
    expect(modeForExpiry("2026-08-17T12:00:00Z", now)).toBe("stale");
    expect(modeForExpiry(undefined, now)).toBe("stale");
  });
});
