import type { ApiSportsFixture } from "@/providers/api-sports/schemas";

/**
 * The bridge. There is no shared fixture identifier between football-data.org /
 * MLB StatsAPI and API-Sports, so a stored game is matched to a vendor fixture
 * by team id plus kickoff. Candidates are already filtered to one team, so this
 * compares time only — a name comparison would just re-derive that, badly.
 *
 * A baseball doubleheader is resolved by taking the nearest kickoff. Anything
 * outside the window is left unmatched, never guessed at.
 */
export const KICKOFF_WINDOW_MS = 3 * 60 * 60 * 1000;

export function matchFixture(
  storedGame: { scheduledAt: string },
  candidates: readonly ApiSportsFixture[],
): ApiSportsFixture | undefined {
  const scheduledAt = Date.parse(storedGame.scheduledAt);
  if (Number.isNaN(scheduledAt)) return undefined;

  let best: ApiSportsFixture | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const kickoff = Date.parse(candidate.kickoff);
    if (Number.isNaN(kickoff)) continue;
    const delta = Math.abs(kickoff - scheduledAt);
    if (delta > KICKOFF_WINDOW_MS || delta >= bestDelta) continue;
    best = candidate;
    bestDelta = delta;
  }
  return best;
}

/** Fixtures on a date involving one API-Sports team id. */
export function fixturesForTeam(
  fixtures: readonly ApiSportsFixture[],
  teamId: number,
) {
  return fixtures.filter(
    (fixture) => fixture.homeTeamId === teamId || fixture.awayTeamId === teamId,
  );
}
