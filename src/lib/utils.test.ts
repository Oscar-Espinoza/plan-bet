import { afterEach, describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/utils";

const KICKOFF = "2026-08-30T15:00:00.000Z";
const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("match time formatting", () => {
  it("shows weekday, day, month, year, time, and an explicit zone", () => {
    const formatted = formatDateTime(KICKOFF);

    expect(formatted).toContain("Sun");
    expect(formatted).toContain("Aug");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    // Whatever the runner's zone, a label is always present.
    expect(formatted).toMatch(/[A-Z]{2,5}|GMT[+-]\d{1,2}/);
  });

  it("shows only the reader's zone, never a second UTC reading", () => {
    const formatted = formatDateTime(KICKOFF);

    expect(formatted).not.toContain("(");
    if (new Date(KICKOFF).getTimezoneOffset() !== 0) {
      expect(formatted).not.toContain("UTC");
    }
  });

  it("never emits a raw ISO string", () => {
    expect(formatDateTime(KICKOFF)).not.toContain(KICKOFF);
    expect(formatDateTime(KICKOFF)).not.toContain("2026-08-30");
  });
});
