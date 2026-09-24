export const STORAGE_KEY = "matchday-plan:v1";

// Hand-written rather than a zod schema: this module is in the root layout's
// client graph, and zod alone was ~64 KB gzipped on every route for five
// fields. Same contract as before — a field that fails its check falls back to
// its default instead of failing the whole payload, and unknown keys are
// dropped because the result is built field by field.
export type StoredState = {
  version: 3;
  anonymousId: string;
  // Added after v3 shipped. An older payload picks up the default, so no
  // version bump and no migrateLegacy arm.
  tourStep: number;
  introDismissed: boolean;
  // Added after v3 shipped, same trick: the uuid every buddy turn in one
  // browsing session groups under. A corrupt or missing value mints a fresh
  // conversation rather than failing the workspace — never the SSR placeholder
  // uuid, which the API route treats as unhydrated.
  buddyConversation: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

export function createDefaultState(
  anonymousId = "00000000-0000-4000-8000-000000000000",
  buddyConversation = anonymousId,
): StoredState {
  return {
    version: 3,
    anonymousId,
    tourStep: 0,
    introDismissed: false,
    buddyConversation,
  };
}

/** Narrows any object to exactly the stored fields, or null if it can't be one. */
export function toStoredState(input: unknown): StoredState | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (value.version !== 3 || !isUuid(value.anonymousId)) return null;
  const { tourStep } = value;
  return {
    version: 3,
    anonymousId: value.anonymousId,
    tourStep:
      Number.isInteger(tourStep) &&
      (tourStep as number) >= 0 &&
      (tourStep as number) <= 4
        ? (tourStep as number)
        : 0,
    introDismissed:
      typeof value.introDismissed === "boolean" ? value.introDismissed : false,
    buddyConversation: isUuid(value.buddyConversation)
      ? value.buddyConversation
      : crypto.randomUUID(),
  };
}

/**
 * Phase B dropped the sport/team selection the topbar mode switcher used to
 * drive (v2 -> v3), once the slate replaced it as the one way to find a game.
 * Spreading a returning browser's payload over the current default keeps what
 * still has a home (anonymousId, tour state) and lets `toStoredState` silently
 * drop the rest — which is also how the removed briefing fields leave a v3
 * payload without needing a version bump. Anything older than v2 predates
 * Phase A and falls through to `parseStoredState`'s default — browser-local
 * demo state, not data worth three migration arms.
 */
function migrateLegacy(input: unknown, fallbackId: string): unknown {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  if (value.version === 2) {
    return { ...createDefaultState(fallbackId), ...value, version: 3 };
  }
  return input;
}

export function parseStoredState(
  raw: string | null,
  fallbackId: string,
): StoredState {
  if (!raw) return createDefaultState(fallbackId);
  try {
    return (
      toStoredState(migrateLegacy(JSON.parse(raw), fallbackId)) ??
      createDefaultState(fallbackId)
    );
  } catch {
    return createDefaultState(fallbackId);
  }
}
