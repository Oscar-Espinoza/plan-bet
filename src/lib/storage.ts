import { z } from "zod";
import { briefingSchema } from "@/lib/contracts";

export const STORAGE_KEY = "matchday-plan:v1";

export const storedStateSchema = z.object({
  version: z.literal(3),
  savedBriefings: z.array(z.string()),
  viewedBriefings: z.array(z.string()),
  // Added after v1 shipped. `.default` keeps older payloads valid and `.catch`
  // means one corrupt briefing cannot discard a whole workspace.
  generatedBriefings: z
    .record(z.string(), briefingSchema)
    .catch({})
    .default({}),
  anonymousId: z.uuid(),
  // Added after v3 shipped. Same `.default` trick as generatedBriefings: an
  // older payload parses clean and picks up the default, so no version bump
  // and no migrateLegacy arm.
  tourStep: z.number().int().min(0).max(4).catch(0).default(0),
  introDismissed: z.boolean().catch(false).default(false),
  // Added after v3 shipped, same `.catch().default()` trick: the uuid every
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
    savedBriefings: [],
    viewedBriefings: [],
    generatedBriefings: {},
    anonymousId,
    tourStep: 0,
    introDismissed: false,
    buddyConversation,
  };
}

/**
 * Chains version 0 -> 1 -> 2 -> 3 rather than jumping straight to current:
 * each step only needs to know the shift immediately before it. Phase A
 * dropped watchlist/activity/recap entirely (v1 -> v2); Phase B dropped the
 * sport/team selection the topbar mode switcher used to drive (v2 -> v3),
 * once the slate replaced it as the one way to find a game. Spreading a
 * returning browser's payload over the current default keeps what still has
 * a home (saved and generated briefings, anonymousId) and lets
 * `storedStateSchema` silently strip the rest, rather than discarding a
 * returning browser's whole workspace.
 */
function migrateLegacy(input: unknown, fallbackId: string): unknown {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  if (value.version === 0) {
    return migrateLegacy(
      {
        ...createDefaultState(fallbackId),
        ...value,
        version: 1,
        anonymousId: value.anonymousId ?? fallbackId,
      },
      fallbackId,
    );
  }
  if (value.version === 1) {
    return migrateLegacy(
      {
        ...createDefaultState(fallbackId),
        ...value,
        version: 2,
      },
      fallbackId,
    );
  }
  if (value.version === 2) {
    return {
      ...createDefaultState(fallbackId),
      ...value,
      version: 3,
    };
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
