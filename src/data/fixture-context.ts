import "server-only";

import {
  dueWork,
  readCache,
  upsertFixtureContext,
  writeCache,
  type CacheKey,
  type DueGame,
} from "@/data/fixture-context-repository";
import { buildFacts, buildSummary } from "@/data/fixture-facts";
import {
  acquireRefreshLease,
  completeRefreshLease,
} from "@/data/sports-repository";
import { gameSummarySchema, type GameSummary } from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import {
  ApiSportsClient,
  isApiSportsConfigured,
} from "@/providers/api-sports/client";
import { fixturesForTeam, matchFixture } from "@/providers/api-sports/match";
import { API_SPORTS_TEAM_IDS } from "@/providers/api-sports/teams";
import {
  APIFOOTBALL_MAX_RANGE_DAYS,
  APIFOOTBALL_TEAM_IDS,
  fetchHeadToHead,
  fetchMatches,
  fetchPredictions,
  fetchStandings,
  isApiFootballConfigured,
} from "@/providers/apifootball/provider";
import type {
  ApiFootballMatch,
  ApiFootballPrediction,
  ApiFootballStandingRow,
} from "@/providers/apifootball/schemas";
import {
  fetchStandings as fetchBaseballStandings,
  isBigBallsConfigured,
} from "@/providers/bigballs/provider";
import type { BigBallsStandingRow } from "@/providers/bigballs/schemas";
import { providerErrorCode } from "@/providers/provider-error";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DEFAULT_LIMIT = 20;
const REBUILD_AFTER_MS = 12 * HOUR_MS;

/**
 * The API-Sports free plan only serves fixtures a day either side of today, so
 * injuries — the one fact nothing else carries — are only reachable close to
 * kickoff. Asking earlier spends a request to be told no.
 */
const INJURY_WINDOW_MS = DAY_MS;

const TTL = {
  discovery: DAY_MS,
  predictions: 12 * HOUR_MS,
  standings: 12 * HOUR_MS,
  headToHead: 7 * DAY_MS,
  fixtures: 2 * HOUR_MS,
  injuries: 2 * HOUR_MS,
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * One keyed call, served from `provider_cache` while the row is still fresh. A
 * hit skips both the request and the parse; a miss pays for both once and every
 * fixture in the run reuses the result.
 *
 * ponytail: a hit is cast, not re-validated — it is this build's own already
 * parsed output and the rows expire within a week. Re-parse here if a flat shape
 * ever has to survive a deploy.
 */
async function cached<T>(
  key: CacheKey,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await readCache(key);
  if (hit !== undefined && hit !== null) return hit as T;
  const fresh = await load();
  await writeCache({ ...key, payload: fresh, ttlMs });
  return fresh;
}

/**
 * One source's failure must never take the others down with it: a fixture with
 * a table but no head-to-head is still worth building. Returns undefined and
 * logs the code, never the URL or the query.
 */
async function attempt<T>(
  requestId: string,
  operation: string,
  load: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await load();
  } catch (error) {
    logEvent("warn", "fixture_context", {
      requestId,
      operation,
      status: "failed",
      errorCode: providerErrorCode(error),
    });
    return undefined;
  }
}

type SoccerSources = {
  matches: ApiFootballMatch[];
  predictions: ApiFootballPrediction[];
  standings: ApiFootballStandingRow[];
};

/** The three league-wide soccer pulls, fetched once per run and shared. */
async function loadSoccerSources(
  requestId: string,
  now: Date,
): Promise<SoccerSources> {
  const from = now;
  const to = new Date(now.getTime() + APIFOOTBALL_MAX_RANGE_DAYS * DAY_MS);
  const scope = `laliga:${isoDay(from)}:${isoDay(to)}`;

  const [matches, predictions, standings] = await Promise.all([
    attempt(requestId, "discovery", () =>
      cached(
        { provider: "apifootball", kind: "discovery", scope },
        TTL.discovery,
        () => fetchMatches({ from, to }),
      ),
    ),
    attempt(requestId, "predictions", () =>
      cached(
        { provider: "apifootball", kind: "predictions", scope },
        TTL.predictions,
        () => fetchPredictions({ from, to }),
      ),
    ),
    attempt(requestId, "standings", () =>
      cached(
        { provider: "apifootball", kind: "standings", scope: "laliga" },
        TTL.standings,
        () => fetchStandings(),
      ),
    ),
  ]);

  return {
    matches: matches ?? [],
    predictions: predictions ?? [],
    standings: standings ?? [],
  };
}

/**
 * Who is missing, and why. Only reachable inside the free plan's window, and
 * only for football — the two reasons this is a per-fixture call rather than
 * part of the shared pull.
 */
async function loadInjuries(
  requestId: string,
  client: ApiSportsClient,
  summary: GameSummary,
) {
  const day = summary.scheduledAt.slice(0, 10);
  const fixtures = await attempt(requestId, "fixtures", () =>
    cached(
      { provider: "api-sports", kind: "fixtures", scope: `soccer:${day}` },
      TTL.fixtures,
      () => client.getFixturesByDate("soccer", day),
    ),
  );
  if (!fixtures?.length) return undefined;

  const teamId = API_SPORTS_TEAM_IDS[summary.teamSlug];
  const fixture = matchFixture(summary, fixturesForTeam(fixtures, teamId));
  if (!fixture) return undefined;

  return attempt(requestId, "injuries", () =>
    cached(
      {
        provider: "api-sports",
        kind: "injuries",
        scope: String(fixture.id),
      },
      TTL.injuries,
      () => client.getInjuries(fixture.id),
    ),
  );
}

export type EnrichResult =
  | { ok: true; runId: string; built: number; skipped: number; failed: number }
  | { ok: false; reason: "locked" | "unconfigured" };

/**
 * Builds the stored context for every upcoming game that has none, or whose
 * context has gone stale. Reuses the sports-refresh ingestion lease
 * (`ingestion_runs`, provider "fixture-context") exactly as settlement does, so
 * two runs cannot spend the same requests twice.
 *
 * A fixture that produces no facts is left alone rather than written empty: a
 * source outage must never overwrite last-known-good context.
 */
export async function enrichDueFixtures(input: {
  requestId: string;
  now?: Date;
  limit?: number;
}): Promise<EnrichResult> {
  const now = input.now ?? new Date();
  const soccerOn = isApiFootballConfigured();
  const baseballOn = isBigBallsConfigured();
  if (!soccerOn && !baseballOn) return { ok: false, reason: "unconfigured" };

  const lease = await acquireRefreshLease({
    provider: "fixture-context",
    operation: "enrich",
    scope: "all",
    requestId: input.requestId,
    now,
  });
  if (!lease) return { ok: false, reason: "locked" };

  const counts = { built: 0, skipped: 0, failed: 0 };
  let runError: unknown;

  try {
    const due = await dueWork({
      now,
      horizonDays: APIFOOTBALL_MAX_RANGE_DAYS,
      limit: input.limit ?? DEFAULT_LIMIT,
      rebuildAfterMs: REBUILD_AFTER_MS,
    });

    const wants = (sport: DueGame["sport"]) =>
      due.some((game) => game.sport === sport);

    const soccer =
      soccerOn && wants("soccer")
        ? await loadSoccerSources(input.requestId, now)
        : undefined;

    const baseball =
      baseballOn && wants("baseball")
        ? await attempt(input.requestId, "standings", () =>
            cached(
              {
                provider: "bigballs",
                kind: "standings",
                scope: `mlb:${now.getUTCFullYear()}`,
              },
              TTL.standings,
              () => fetchBaseballStandings(),
            ),
          )
        : undefined;

    // One client for the run so its own pacing and request ceiling apply
    // across every fixture, not per fixture.
    const apiSports =
      soccer && isApiSportsConfigured() ? new ApiSportsClient() : undefined;

    for (const game of due) {
      try {
        const summary = gameSummarySchema.parse(game.summary);
        const observedAt = now.toISOString();

        if (summary.sport === "baseball") {
          // ponytail: standings only. BigBalls reports `injuries: none` and
          // `lineups: none`, its scheduled window reaches ~2 days, and
          // `get_matches` cannot filter by team — form and head-to-head would
          // cost a call per day per team for signal the standings row already
          // carries in its streak, record and run differential.
          const facts = buildFacts({
            canonicalGameId: game.canonicalId,
            sport: "baseball",
            homeTeam: summary.homeTeam,
            awayTeam: summary.awayTeam,
            observedAt,
            baseballTable: baseball as BigBallsStandingRow[] | undefined,
          });
          if (facts.length === 0) {
            counts.skipped += 1;
            continue;
          }
          await upsertFixtureContext({
            gameId: game.id,
            facts,
            summary: buildSummary(
              {
                canonicalGameId: game.canonicalId,
                sport: "baseball",
                homeTeam: summary.homeTeam,
                awayTeam: summary.awayTeam,
                observedAt,
              },
              facts,
            ),
            now,
          });
          counts.built += 1;
          continue;
        }

        if (!soccer) {
          counts.skipped += 1;
          continue;
        }

        const teamId = APIFOOTBALL_TEAM_IDS[summary.teamSlug];
        const matched = teamId
          ? matchFixture(
              summary,
              soccer.matches.filter(
                (match) =>
                  match.homeTeamId === teamId || match.awayTeamId === teamId,
              ),
            )
          : undefined;

        // Vendor names where the fixture resolved, so form, head-to-head and
        // the table all key off one vocabulary; the stored summary's names
        // otherwise.
        const homeTeam = matched?.homeTeam ?? summary.homeTeam;
        const awayTeam = matched?.awayTeam ?? summary.awayTeam;

        const headToHead = matched
          ? await attempt(input.requestId, "head_to_head", () =>
              cached(
                {
                  provider: "apifootball",
                  kind: "h2h",
                  scope: `${matched.homeTeamId}:${matched.awayTeamId}`,
                },
                TTL.headToHead,
                () =>
                  fetchHeadToHead({
                    homeTeamId: matched.homeTeamId,
                    awayTeamId: matched.awayTeamId,
                  }),
              ),
            )
          : undefined;

        const injuries =
          apiSports &&
          Date.parse(summary.scheduledAt) - now.getTime() < INJURY_WINDOW_MS
            ? await loadInjuries(input.requestId, apiSports, summary)
            : undefined;

        const bundle = {
          canonicalGameId: game.canonicalId,
          sport: "soccer" as const,
          homeTeam,
          awayTeam,
          observedAt,
          injuries,
          prediction: matched
            ? soccer.predictions.find(
                (prediction) => prediction.matchId === matched.id,
              )
            : undefined,
          meetings: headToHead?.meetings,
          homeForm: headToHead?.homeForm,
          awayForm: headToHead?.awayForm,
          soccerTable: soccer.standings,
        };

        const facts = buildFacts(bundle);
        if (facts.length === 0) {
          counts.skipped += 1;
          continue;
        }
        await upsertFixtureContext({
          gameId: game.id,
          facts,
          summary: buildSummary(bundle, facts),
          now,
        });
        counts.built += 1;
      } catch {
        // One fixture's failure must never stop the rest of the run.
        counts.failed += 1;
      }
    }
  } catch (error) {
    runError = error;
  } finally {
    await completeRefreshLease({
      id: lease.id,
      startedAt: lease.startedAt,
      status: runError ? "failed" : "succeeded",
      errorCode: runError ? "enrich_run_failed" : undefined,
      errorMessage: runError
        ? runError instanceof Error
          ? runError.message
          : "enrich run failed"
        : JSON.stringify(counts),
    });
  }

  // Counts only — no fixture ids, no URLs, no query data, the same shape the
  // sports_ingestion log keeps to.
  logEvent(runError ? "warn" : "info", "fixture_context", {
    requestId: input.requestId,
    runId: lease.id,
    ...counts,
  });

  if (runError) throw runError;

  return { ok: true, runId: lease.id, ...counts };
}
