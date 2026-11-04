import {
  STORAGE_KEY,
  createDefaultState,
  parseStoredState,
  toStoredState,
  type StoredState,
} from "#lib/shared/storage";

const defaults = createDefaultState();

let hydrated = $state(false);
let version = $state<StoredState["version"]>(defaults.version);
let anonymousId = $state(defaults.anonymousId);
let tourStep = $state(defaults.tourStep);
let introDismissed = $state(defaults.introDismissed);
let buddyConversation = $state(defaults.buddyConversation);
let commentDraft = $state<{ groupId: string; text: string } | undefined>(
  undefined,
);

function snapshot(): StoredState {
  return {
    version,
    anonymousId,
    tourStep,
    introDismissed,
    buddyConversation,
  };
}

function persist() {
  if (typeof window === "undefined") return;
  const data = toStoredState(snapshot());
  if (!data) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function commit(update: Partial<StoredState>) {
  if (update.version !== undefined) version = update.version;
  if (update.anonymousId !== undefined) anonymousId = update.anonymousId;
  if (update.tourStep !== undefined) tourStep = update.tourStep;
  if (update.introDismissed !== undefined)
    introDismissed = update.introDismissed;
  if (update.buddyConversation !== undefined)
    buddyConversation = update.buddyConversation;
  persist();
}

export const matchday = {
  get hydrated() {
    return hydrated;
  },
  get version() {
    return version;
  },
  get anonymousId() {
    return anonymousId;
  },
  get tourStep() {
    return tourStep;
  },
  get introDismissed() {
    return introDismissed;
  },
  get buddyConversation() {
    return buddyConversation;
  },
  get commentDraft() {
    return commentDraft;
  },
  hydrate() {
    if (hydrated || typeof window === "undefined") return;
    const fallbackId = crypto.randomUUID();
    const stored = parseStoredState(
      window.localStorage.getItem(STORAGE_KEY),
      fallbackId,
    );
    version = stored.version;
    anonymousId = stored.anonymousId;
    tourStep = stored.tourStep;
    introDismissed = stored.introDismissed;
    buddyConversation = stored.buddyConversation;
    hydrated = true;
    persist();
  },
  advanceTour(step: number) {
    if (step <= tourStep) return;
    commit({ tourStep: step });
  },
  finishTour() {
    commit({ tourStep: 4 });
  },
  dismissIntro() {
    commit({ introDismissed: true });
  },
  draftComment(groupId: string, text: string) {
    commentDraft = { groupId, text };
  },
  clearCommentDraft() {
    commentDraft = undefined;
  },
};
