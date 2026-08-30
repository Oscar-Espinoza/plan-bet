import { z } from "zod";

export const STORAGE_KEY = "matchday-plan:v1";

export const storedStateSchema = z.object({
  version: z.literal(3),
  anonymousId: z.uuid(),
  // Added after v3 shipped. `.catch().default()` means an older payload parses
  // clean and picks up the default, so no version bump and no migrateLegacy arm.
  tourStep: z.number().int().min(0).max(4).catch(0).default(0),
  introDismissed: z.boolean().catch(false).default(false),
  // Added after v3 shipped, same trick: the uuid every
  // buddy turn in one browsing session groups under. A corrupt or missing
  // value mints a fresh conversation rather than failing the workspace — never
  // the SSR placeholder uuid, which the API route treats as unhydrated.
  buddyConversation: z
    .uuid()
    .catch(() => crypto.randomUUID())
    .default(() => crypto.randomUUID()),
});
export type StoredState = z.infer<typeof storedStateSchema>;

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

/**
 * Phase B dropped the sport/team selection the topbar mode switcher used to
 * drive (v2 -> v3), once the slate replaced it as the one way to find a game.
 * Spreading a returning browser's payload over the current default keeps what
 * still has a home (anonymousId, tour state) and lets `storedStateSchema`
 * silently strip the rest — which is also how the removed briefing fields
 * leave a v3 payload without needing a version bump. Anything older than v2 predates
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
    const parsed = storedStateSchema.safeParse(
      migrateLegacy(JSON.parse(raw), fallbackId),
    );
    return parsed.success ? parsed.data : createDefaultState(fallbackId);
  } catch {
    return createDefaultState(fallbackId);
  }
}
