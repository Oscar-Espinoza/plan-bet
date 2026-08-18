import { describe, expect, it } from "vitest";
import {
  createDefaultState,
  filterWatchlist,
  getActivityTotals,
  parseStoredState,
  type ActivityEvent,
  type WatchlistItem,
} from "@/lib/storage";

const fallbackId = "10000000-0000-4000-8000-000000000001";

const item = (overrides: Partial<WatchlistItem> = {}): WatchlistItem => ({
  id: "item-1",
  sport: "soccer",
  teamSlug: "real-madrid",
  text: "Confirm lineup",
  status: "open",
  createdAt: "2030-01-01T12:00:00.000Z",
  ...overrides,
});

describe("browser storage", () => {
  it("returns defaults for corrupt or future-version state", () => {
    expect(parseStoredState("not json", fallbackId)).toEqual(
      createDefaultState(fallbackId),
    );
    expect(
      parseStoredState(JSON.stringify({ version: 99 }), fallbackId),
    ).toEqual(createDefaultState(fallbackId));
  });

  it("migrates the legacy selectedTeam field", () => {
    const legacy = {
      ...createDefaultState(fallbackId),
      version: 0,
      selectedTeam: "barcelona",
      selectedTeamSlug: undefined,
    };
    const result = parseStoredState(JSON.stringify(legacy), fallbackId);
    expect(result.version).toBe(1);
    expect(result.selectedTeamSlug).toBe("barcelona");
  });

  it("normalizes user text and trims history to 100 events", () => {
    const events: ActivityEvent[] = Array.from({ length: 105 }, (_, index) => ({
      id: `event-${index}`,
      type: "team_selected",
      label: `Event ${index}`,
      at: "2030-01-01T12:00:00.000Z",
    }));
    const raw = {
      ...createDefaultState(fallbackId),
      watchlistItems: [item({ text: "  Confirm   lineup  " })],
      recapNotes: { game: "  Compact   note  " },
      activityEvents: events,
    };
    const result = parseStoredState(JSON.stringify(raw), fallbackId);
    expect(result.watchlistItems[0].text).toBe("Confirm lineup");
    expect(result.recapNotes.game).toBe("Compact note");
    expect(result.activityEvents).toHaveLength(100);
  });
});

describe("watchlist filtering and activity totals", () => {
  const items = [
    item(),
    item({
      id: "item-2",
      sport: "baseball",
      teamSlug: "new-york-yankees",
      status: "completed",
      completedAt: "2030-01-02T12:00:00.000Z",
    }),
    item({ id: "item-3", teamSlug: "barcelona" }),
  ];

  it("combines sport, team, and status filters", () => {
    expect(
      filterWatchlist(items, { sport: "soccer", status: "open" }),
    ).toHaveLength(2);
    expect(filterWatchlist(items, { teamSlug: "barcelona" })).toEqual([
      items[2],
    ]);
    expect(
      filterWatchlist(items, { sport: "baseball", status: "open" }),
    ).toEqual([]);
  });

  it("reports exact current totals without double-counting IDs", () => {
    const totals = getActivityTotals({
      viewedBriefings: ["game-a", "game-a", "game-b"],
      savedBriefings: ["game-a"],
      watchlistItems: items,
      recapNotes: { "game-a": "Note", "game-b": "" },
    });
    expect(totals).toEqual({
      briefingsViewed: 2,
      briefingsSaved: 1,
      watchlistItems: 3,
      completedItems: 1,
      recaps: 1,
    });
  });
});
