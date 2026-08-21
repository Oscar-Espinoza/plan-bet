import { z } from "zod";
import {
  briefingSchema,
  sportSchema,
  teamSlugSchema,
  type Sport,
  type TeamSlug,
} from "@/lib/contracts";

export const STORAGE_KEY = "matchday-plan:v1";

export const storedStateSchema = z.object({
  version: z.literal(2),
  selectedSport: sportSchema,
  selectedTeamSlug: teamSlugSchema,
  savedBriefings: z.array(z.string()),
  viewedBriefings: z.array(z.string()),
  // Added after v1 shipped. `.default` keeps older payloads valid and `.catch`
  // means one corrupt briefing cannot discard a whole workspace.
  generatedBriefings: z
    .record(z.string(), briefingSchema)
    .catch({})
    .default({}),
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
    version: 2,
    selectedSport: "soccer",
    selectedTeamSlug: "real-madrid",
    savedBriefings: [],
    viewedBriefings: [],
    generatedBriefings: {},
    anonymousId,
  };
}

/**
 * Chains version 0 -> 1 -> 2 rather than jumping straight to current: each
 * step only needs to know the shift immediately before it. Phase A dropped
 * watchlist/activity/recap entirely (v1 -> v2); spreading a v1 payload over
 * the v2 default keeps what still has a home (sport/team selection, saved
 * and generated briefings) and lets `storedStateSchema` silently strip the
 * rest, rather than discarding a returning browser's whole workspace.
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
        selectedTeamSlug:
          value.selectedTeam ?? value.selectedTeamSlug ?? "real-madrid",
        anonymousId: value.anonymousId ?? fallbackId,
      },
      fallbackId,
    );
  }
  if (value.version === 1) {
    return {
      ...createDefaultState(fallbackId),
      ...value,
      version: 2,
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
    if (!parsed.success) return createDefaultState(fallbackId);
    const state = parsed.data;
    if (!compatibleTeam(state.selectedSport, state.selectedTeamSlug)) {
      return {
        ...state,
        selectedTeamSlug:
          state.selectedSport === "soccer" ? "real-madrid" : "new-york-yankees",
      };
    }
    return state;
  } catch {
    return createDefaultState(fallbackId);
  }
}
