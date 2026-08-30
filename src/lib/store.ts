"use client";

import { create } from "zustand";
import {
  STORAGE_KEY,
  createDefaultState,
  parseStoredState,
  storedStateSchema,
  type StoredState,
} from "@/lib/storage";

type MatchdayActions = {
  hydrated: boolean;
  hydrate: () => void;
  advanceTour: (step: number) => void;
  finishTour: () => void;
  dismissIntro: () => void;
  // Not part of `StoredState`: a hand-off from a buddy turn to the group
  // thread's textarea, gone the moment it's consumed. Set with `set()`
  // rather than `commit()` so it never reaches `persist()` — the same
  // reason `hydrated` isn't in the schema either.
  commentDraft?: { groupId: string; text: string };
  draftComment: (groupId: string, text: string) => void;
  clearCommentDraft: () => void;
};

export type MatchdayStore = StoredState & MatchdayActions;

// `storedStateSchema` strips the action functions and `hydrated` on its own,
// so the persisted shape follows the schema without a field list to keep in
// sync every time one is added.
function persist(state: MatchdayStore) {
  if (typeof window === "undefined") return;
  const data = storedStateSchema.parse(state);
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
      const fallbackId = crypto.randomUUID();
      const state = parseStoredState(
        window.localStorage.getItem(STORAGE_KEY),
        fallbackId,
      );
      set({ ...state, hydrated: true });
      persist(get());
    },
    // Monotonic: backtracking to the slate mid-tour (or replaying step 0)
    // never rewinds progress already made.
    advanceTour: (step) => {
      if (step <= get().tourStep) return;
      commit({ tourStep: step });
    },
    finishTour: () => commit({ tourStep: 4 }),
    dismissIntro: () => commit({ introDismissed: true }),
    draftComment: (groupId, text) => set({ commentDraft: { groupId, text } }),
    clearCommentDraft: () => set({ commentDraft: undefined }),
  };
});
