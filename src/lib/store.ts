"use client";

import { create } from "zustand";
import { getTeam } from "@/lib/seed";
import {
  STORAGE_KEY,
  createDefaultState,
  parseStoredState,
  storedStateSchema,
  type ActivityEvent,
  type StoredState,
  type WatchlistItem,
} from "@/lib/storage";
import type { Sport, TeamSlug } from "@/lib/contracts";
import { normalizeText } from "@/lib/utils";

type WatchlistInput = Pick<WatchlistItem, "sport" | "teamSlug" | "text"> &
  Partial<Pick<WatchlistItem, "gameId" | "gameLabel">>;

type MatchdayActions = {
  hydrated: boolean;
  hydrate: () => void;
  selectSport: (sport: Sport) => void;
  selectTeam: (teamSlug: TeamSlug) => void;
  addWatchlistItem: (input: WatchlistInput) => string | null;
  updateWatchlistItem: (id: string, text: string) => boolean;
  toggleWatchlistItem: (id: string) => boolean;
  deleteWatchlistItem: (id: string) => boolean;
  saveRecap: (gameId: string, text: string, teamSlug: TeamSlug) => boolean;
  viewBriefing: (gameId: string, teamSlug: TeamSlug) => void;
  toggleSavedBriefing: (gameId: string, teamSlug: TeamSlug) => void;
  resetDemo: () => void;
};

export type MatchdayStore = StoredState & MatchdayActions;

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function dataFromStore(state: MatchdayStore): StoredState {
  return {
    version: 1,
    selectedSport: state.selectedSport,
    selectedTeamSlug: state.selectedTeamSlug,
    watchlistItems: state.watchlistItems,
    recapNotes: state.recapNotes,
    savedBriefings: state.savedBriefings,
    viewedBriefings: state.viewedBriefings,
    activityEvents: state.activityEvents,
    anonymousId: state.anonymousId,
  };
}

function persist(state: MatchdayStore) {
  if (typeof window === "undefined") return;
  const data = storedStateSchema.parse(dataFromStore(state));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function event(
  type: ActivityEvent["type"],
  label: string,
  details?: Pick<ActivityEvent, "gameId" | "teamSlug">,
): ActivityEvent {
  return {
    id: makeId(),
    type,
    label,
    at: new Date().toISOString(),
    ...details,
  };
}

const ssrDefaults = createDefaultState();

export const useMatchdayStore = create<MatchdayStore>((set, get) => {
  const commit = (update: Partial<StoredState>) => {
    set(update);
    persist(get());
  };
  const addEvent = (activity: ActivityEvent) =>
    [activity, ...get().activityEvents].slice(0, 100);

  return {
    ...ssrDefaults,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated || typeof window === "undefined") return;
      const fallbackId = makeId();
      const state = parseStoredState(
        window.localStorage.getItem(STORAGE_KEY),
        fallbackId,
      );
      set({ ...state, hydrated: true });
      persist(get());
    },
    selectSport: (sport) => {
      if (get().selectedSport === sport) return;
      const selectedTeamSlug: TeamSlug =
        sport === "soccer" ? "real-madrid" : "new-york-yankees";
      const team = getTeam(selectedTeamSlug)!;
      commit({
        selectedSport: sport,
        selectedTeamSlug,
        activityEvents: addEvent(
          event("team_selected", `Switched workspace to ${team.name}`, {
            teamSlug: selectedTeamSlug,
          }),
        ),
      });
    },
    selectTeam: (teamSlug) => {
      if (get().selectedTeamSlug === teamSlug) return;
      const team = getTeam(teamSlug);
      if (!team) return;
      commit({
        selectedSport: team.sport,
        selectedTeamSlug: teamSlug,
        activityEvents: addEvent(
          event("team_selected", `Selected ${team.name}`, { teamSlug }),
        ),
      });
    },
    addWatchlistItem: (input) => {
      const text = normalizeText(input.text);
      if (!text) return null;
      const id = makeId();
      const item: WatchlistItem = {
        id,
        sport: input.sport,
        teamSlug: input.teamSlug,
        gameId: input.gameId,
        gameLabel: input.gameLabel,
        text,
        status: "open",
        createdAt: new Date().toISOString(),
      };
      commit({
        watchlistItems: [item, ...get().watchlistItems],
        activityEvents: addEvent(
          event("watchlist_created", `Added “${text}” to the watchlist`, {
            gameId: input.gameId,
            teamSlug: input.teamSlug,
          }),
        ),
      });
      return id;
    },
    updateWatchlistItem: (id, value) => {
      const text = normalizeText(value);
      const current = get().watchlistItems.find((item) => item.id === id);
      if (!current || !text || current.text === text) return false;
      commit({
        watchlistItems: get().watchlistItems.map((item) =>
          item.id === id ? { ...item, text } : item,
        ),
        activityEvents: addEvent(
          event("watchlist_updated", `Updated “${text}”`, {
            gameId: current.gameId,
            teamSlug: current.teamSlug,
          }),
        ),
      });
      return true;
    },
    toggleWatchlistItem: (id) => {
      const current = get().watchlistItems.find((item) => item.id === id);
      if (!current) return false;
      const completed = current.status === "open";
      commit({
        watchlistItems: get().watchlistItems.map((item) =>
          item.id === id
            ? {
                ...item,
                status: completed ? "completed" : "open",
                completedAt: completed ? new Date().toISOString() : undefined,
              }
            : item,
        ),
        activityEvents: addEvent(
          event(
            completed ? "watchlist_completed" : "watchlist_reopened",
            `${completed ? "Completed" : "Reopened"} “${current.text}”`,
            {
              gameId: current.gameId,
              teamSlug: current.teamSlug,
            },
          ),
        ),
      });
      return true;
    },
    deleteWatchlistItem: (id) => {
      const current = get().watchlistItems.find((item) => item.id === id);
      if (!current) return false;
      commit({
        watchlistItems: get().watchlistItems.filter((item) => item.id !== id),
        activityEvents: addEvent(
          event("watchlist_deleted", `Removed “${current.text}”`, {
            gameId: current.gameId,
            teamSlug: current.teamSlug,
          }),
        ),
      });
      return true;
    },
    saveRecap: (gameId, value, teamSlug) => {
      const text = normalizeText(value, 2000);
      if (!text) return false;
      const previous = get().recapNotes[gameId];
      if (previous === text) return false;
      commit({
        recapNotes: { ...get().recapNotes, [gameId]: text },
        activityEvents: addEvent(
          event(
            "recap_saved",
            previous ? "Updated a game recap" : "Saved a game recap",
            { gameId, teamSlug },
          ),
        ),
      });
      return true;
    },
    viewBriefing: (gameId, teamSlug) => {
      if (get().viewedBriefings.includes(gameId)) return;
      commit({
        viewedBriefings: [...get().viewedBriefings, gameId],
        activityEvents: addEvent(
          event("briefing_viewed", "Viewed a demo brief", { gameId, teamSlug }),
        ),
      });
    },
    toggleSavedBriefing: (gameId, teamSlug) => {
      const saved = get().savedBriefings.includes(gameId);
      commit({
        savedBriefings: saved
          ? get().savedBriefings.filter((id) => id !== gameId)
          : [...get().savedBriefings, gameId],
        activityEvents: addEvent(
          event(
            saved ? "briefing_removed" : "briefing_saved",
            saved ? "Removed a saved brief" : "Saved a demo brief",
            { gameId, teamSlug },
          ),
        ),
      });
    },
    resetDemo: () => {
      if (typeof window !== "undefined")
        window.localStorage.removeItem(STORAGE_KEY);
      set({ ...createDefaultState(makeId()), hydrated: true });
    },
  };
});
