import type { Sport, TeamSlug } from "@/lib/contracts";

/**
 * Resolved once via `pnpm data:apisports:teams` and pinned. Four integers that
 * do not change; a config table would be ceremony.
 */
export const API_SPORTS_TEAM_IDS: Record<TeamSlug, number> = {
  "real-madrid": 541,
  barcelona: 529,
  "new-york-yankees": 25,
  "boston-red-sox": 5,
};

export const API_SPORTS_TEAM_SPORT: Record<TeamSlug, Sport> = {
  "real-madrid": "soccer",
  barcelona: "soccer",
  "new-york-yankees": "baseball",
  "boston-red-sox": "baseball",
};
