import { z } from "zod";
import {
  briefingSchema,
  sportSchema,
  teamSlugSchema,
  type Sport,
  type TeamSlug,
} from "@/lib/contracts";
import { normalizeText } from "@/lib/utils";

export const STORAGE_KEY = "matchday-plan:v1";

export const watchlistStatusSchema = z.enum(["open", "completed"]);

export const watchlistItemSchema = z.object({
  id: z.string().min(1),
  sport: sportSchema,
  teamSlug: teamSlugSchema,
  gameId: z.string().optional(),
  gameLabel: z.string().optional(),
  text: z.string().min(1).max(500),
  status: watchlistStatusSchema,
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

export const activityTypeSchema = z.enum([
  "team_selected",
  "watchlist_created",
  "watchlist_updated",
  "watchlist_completed",
  "watchlist_reopened",
  "watchlist_deleted",
  "recap_saved",
  "briefing_viewed",
  "briefing_generated",
  "briefing_saved",
  "briefing_removed",
]);

export const activityEventSchema = z.object({
  id: z.string().min(1),
  type: activityTypeSchema,
  label: z.string().min(1),
  at: z.iso.datetime(),
  gameId: z.string().optional(),
  teamSlug: teamSlugSchema.optional(),
});
export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const storedStateSchema = z.object({
  version: z.literal(1),
  selectedSport: sportSchema,
  selectedTeamSlug: teamSlugSchema,
  watchlistItems: z.array(watchlistItemSchema),
  recapNotes: z.record(z.string(), z.string().max(2000)),
  savedBriefings: z.array(z.string()),
  viewedBriefings: z.array(z.string()),
  // Added after v1 shipped. `.default` keeps older payloads valid and `.catch`
  // means one corrupt briefing cannot discard a whole workspace.
  generatedBriefings: z
    .record(z.string(), briefingSchema)
    .catch({})
    .default({}),
  activityEvents: z.array(activityEventSchema),
  anonymousId: z.uuid(),
});
export type StoredState = z.infer<typeof storedStateSchema>;

function compatibleTeam(sport: Sport, slug: TeamSlug) {
  return sport === "soccer"
    ? slug === "real-madrid" || slug === "barcelona"
    : slug === "new-york-yankees" || slug === "boston-red-sox";
}

export function createDefaultState(
  anonymousId = "00000000-0000-4000-8000-000000000000",
): StoredState {
  return {
    version: 1,
    selectedSport: "soccer",
    selectedTeamSlug: "real-madrid",
    watchlistItems: [],
    recapNotes: {},
    savedBriefings: [],
    viewedBriefings: [],
    generatedBriefings: {},
    activityEvents: [],
    anonymousId,
  };
}

function migrateLegacy(input: unknown, fallbackId: string): unknown {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  if (value.version !== 0) return input;
  return {
    ...createDefaultState(fallbackId),
    ...value,
    version: 1,
    selectedTeamSlug:
      value.selectedTeam ?? value.selectedTeamSlug ?? "real-madrid",
    anonymousId: value.anonymousId ?? fallbackId,
  };
}

export function parseStoredState(
  raw: string | null,
  fallbackId: string,
): StoredState {
  if (!raw) return createDefaultState(fallbackId);
  try {
    const parsed = storedStateSchema.safeParse(
      migrateLegacy(JSON.parse(raw), fallbackId),
    );
    if (!parsed.success) return createDefaultState(fallbackId);
    const state = parsed.data;
    if (!compatibleTeam(state.selectedSport, state.selectedTeamSlug)) {
      return {
        ...state,
        selectedTeamSlug:
          state.selectedSport === "soccer" ? "real-madrid" : "new-york-yankees",
      };
    }
    return {
      ...state,
      watchlistItems: state.watchlistItems.map((item) => ({
        ...item,
        text: normalizeText(item.text),
      })),
      recapNotes: Object.fromEntries(
        Object.entries(state.recapNotes)
          .map(([key, value]) => [key, normalizeText(value, 2000)])
          .filter(([, value]) => value.length > 0),
      ),
      activityEvents: state.activityEvents.slice(0, 100),
    };
  } catch {
    return createDefaultState(fallbackId);
  }
}

export type WatchlistFilter = {
  sport?: Sport | "all";
  teamSlug?: TeamSlug | "all";
  status?: "open" | "completed" | "all";
};

export function filterWatchlist(
  items: WatchlistItem[],
  filter: WatchlistFilter,
) {
  return items.filter(
    (item) =>
      (!filter.sport ||
        filter.sport === "all" ||
        item.sport === filter.sport) &&
      (!filter.teamSlug ||
        filter.teamSlug === "all" ||
        item.teamSlug === filter.teamSlug) &&
      (!filter.status ||
        filter.status === "all" ||
        item.status === filter.status),
  );
}

export function getActivityTotals(
  state: Pick<
    StoredState,
    "viewedBriefings" | "savedBriefings" | "watchlistItems" | "recapNotes"
  >,
) {
  return {
    briefingsViewed: new Set(state.viewedBriefings).size,
    briefingsSaved: new Set(state.savedBriefings).size,
    watchlistItems: state.watchlistItems.length,
    completedItems: state.watchlistItems.filter(
      (item) => item.status === "completed",
    ).length,
    recaps: Object.values(state.recapNotes).filter(Boolean).length,
  };
}
