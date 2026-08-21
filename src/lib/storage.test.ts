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

  it("migrates the legacy selectedTeam field through v0 and v1 to v2", () => {
    const legacy = {
      version: 0,
      selectedTeam: "barcelona",
    };
    const result = parseStoredState(JSON.stringify(legacy), fallbackId);
    expect(result.version).toBe(2);
    expect(result.selectedTeamSlug).toBe("barcelona");
  });

  // Phase A dropped watchlist/activity/recap entirely. A returning browser's
  // v1 payload should still keep what has a home in v2 — sport/team
  // selection and saved briefings — rather than being discarded outright.
  it("upgrades a v1 payload, keeping selection and briefings and dropping watchlist state", () => {
    const v1 = {
      version: 1,
      selectedSport: "baseball",
      selectedTeamSlug: "new-york-yankees",
      watchlistItems: [{ id: "item-1", text: "stale watchlist item" }],
      recapNotes: { "game-a": "stale recap" },
      savedBriefings: ["game-a"],
      viewedBriefings: ["game-a", "game-b"],
      generatedBriefings: {},
      activityEvents: [{ id: "event-1", type: "team_selected" }],
      anonymousId: "20000000-0000-4000-8000-000000000002",
    };
    const result = parseStoredState(JSON.stringify(v1), fallbackId);
    expect(result.version).toBe(2);
    expect(result.selectedSport).toBe("baseball");
    expect(result.selectedTeamSlug).toBe("new-york-yankees");
    expect(result.savedBriefings).toEqual(["game-a"]);
    expect(result.viewedBriefings).toEqual(["game-a", "game-b"]);
    expect(result.anonymousId).toBe("20000000-0000-4000-8000-000000000002");
    expect(result).not.toHaveProperty("watchlistItems");
    expect(result).not.toHaveProperty("recapNotes");
    expect(result).not.toHaveProperty("activityEvents");
  });
});
