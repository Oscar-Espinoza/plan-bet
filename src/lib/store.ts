"use client";

import { create } from "zustand";
import {
  STORAGE_KEY,
  createDefaultState,
  parseStoredState,
  storedStateSchema,
  type StoredState,
} from "@/lib/storage";
import type { Briefing } from "@/lib/contracts";

type MatchdayActions = {
  hydrated: boolean;
  hydrate: () => void;
  viewBriefing: (gameId: string) => void;
  saveGeneratedBriefing: (gameId: string, briefing: Briefing) => void;
  toggleSavedBriefing: (gameId: string) => void;
  advanceTour: (step: number) => void;
  finishTour: () => void;
  dismissIntro: () => void;
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
    version: 3,
    savedBriefings: state.savedBriefings,
    viewedBriefings: state.viewedBriefings,
    generatedBriefings: state.generatedBriefings,
    anonymousId: state.anonymousId,
    tourStep: state.tourStep,
    introDismissed: state.introDismissed,
    buddyConversation: state.buddyConversation,
  };
}

function persist(state: MatchdayStore) {
  if (typeof window === "undefined") return;
  const data = storedStateSchema.parse(dataFromStore(state));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const ssrDefaults = createDefaultState();

export const useMatchdayStore = create<MatchdayStore>((set, get) => {
  const commit = (update: Partial<StoredState>) => {
    set(update);
    persist(get());
  };

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
    viewBriefing: (gameId) => {
      if (get().viewedBriefings.includes(gameId)) return;
      commit({ viewedBriefings: [...get().viewedBriefings, gameId] });
    },
    saveGeneratedBriefing: (gameId, briefing) => {
      commit({
        generatedBriefings: { ...get().generatedBriefings, [gameId]: briefing },
        viewedBriefings: get().viewedBriefings.includes(gameId)
          ? get().viewedBriefings
          : [...get().viewedBriefings, gameId],
      });
    },
    toggleSavedBriefing: (gameId) => {
      const saved = get().savedBriefings.includes(gameId);
      commit({
        savedBriefings: saved
          ? get().savedBriefings.filter((id) => id !== gameId)
          : [...get().savedBriefings, gameId],
      });
    },
    // Monotonic: backtracking to the slate mid-tour (or replaying step 0)
    // never rewinds progress already made.
    advanceTour: (step) => {
      if (step <= get().tourStep) return;
      commit({ tourStep: step });
    },
    finishTour: () => commit({ tourStep: 4 }),
    dismissIntro: () => commit({ introDismissed: true }),
  };
});
