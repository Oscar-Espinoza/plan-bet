import { describe, expect, it } from "vitest";
import { createDefaultState, parseStoredState } from "@/lib/storage";

const fallbackId = "10000000-0000-4000-8000-000000000001";

describe("browser storage", () => {
  it("returns defaults for corrupt or future-version state", () => {
    expect(parseStoredState("not json", fallbackId)).toEqual(
      createDefaultState(fallbackId),
    );
    expect(
      parseStoredState(JSON.stringify({ version: 99 }), fallbackId),
    ).toEqual(createDefaultState(fallbackId));
  });

  // Anything older than v2 predates Phase A and has no migration arm: it
  // falls through to the defaults rather than being carried forward.
  it("falls back to defaults for a pre-v2 payload", () => {
    const v1 = {
      version: 1,
      anonymousId: "20000000-0000-4000-8000-000000000002",
    };
    expect(parseStoredState(JSON.stringify(v1), fallbackId)).toEqual(
      createDefaultState(fallbackId),
    );
  });

  // Phase B removed the topbar sport toggle and team select the v2 fields
  // drove. A returning browser's v2 payload keeps its briefings and
  // anonymousId; the dead selection is silently stripped by the schema.
  it("upgrades a v2 payload, dropping the sport/team selection and keeping briefings", () => {
    const v2 = {
      version: 2,
      selectedSport: "soccer",
      selectedTeamSlug: "real-madrid",
      anonymousId: "30000000-0000-4000-8000-000000000003",
    };
    const result = parseStoredState(JSON.stringify(v2), fallbackId);
    expect(result.version).toBe(3);
    expect(result.anonymousId).toBe("30000000-0000-4000-8000-000000000003");
    expect(result).not.toHaveProperty("selectedSport");
    expect(result).not.toHaveProperty("selectedTeamSlug");
  });

  // The tour fields were added after v3 shipped as defaulted fields, the
  // same trick generatedBriefings uses — no version bump, no migrateLegacy
  // arm, and a returning v3 browser with no tour state just picks up 0/false.
  it("defaults tourStep and introDismissed on a v3 payload that predates them", () => {
    const v3 = {
      version: 3,
      anonymousId: "40000000-0000-4000-8000-000000000004",
    };
    const result = parseStoredState(JSON.stringify(v3), fallbackId);
    expect(result.tourStep).toBe(0);
    expect(result.introDismissed).toBe(false);
  });

  it("mints a fresh buddyConversation for a v3 payload that predates it, never the SSR placeholder", () => {
    const v3 = {
      version: 3,
      anonymousId: "40000000-0000-4000-8000-000000000004",
    };
    const result = parseStoredState(JSON.stringify(v3), fallbackId);
    expect(result.buddyConversation).not.toBe(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(result.buddyConversation).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("round-trips a stored tour step", () => {
    const stored = { ...createDefaultState(fallbackId), tourStep: 2 };
    const result = parseStoredState(JSON.stringify(stored), fallbackId);
    expect(result.tourStep).toBe(2);
  });
});
