import type { EvidenceFact, Sport } from "@/lib/contracts";
import type {
  ApiFootballMatch,
  ApiFootballPrediction,
  ApiFootballStandingRow,
} from "@/providers/apifootball/schemas";
import type {
  BigBallsMatch,
  BigBallsStandingRow,
} from "@/providers/bigballs/schemas";

/**
 * Everything gathered for one fixture, before it becomes evidence. Every field
 * is optional: a source that failed or had nothing simply contributes no fact,
 * never a "Not provided" placeholder.
 */
export type ContextBundle = {
  canonicalGameId: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  observedAt: string;
  injuries?: { team: string; player: string; reason: string }[];
  prediction?: ApiFootballPrediction;
  meetings?: (ApiFootballMatch | BigBallsMatch)[];
  homeForm?: (ApiFootballMatch | BigBallsMatch)[];
  awayForm?: (ApiFootballMatch | BigBallsMatch)[];
  soccerTable?: ApiFootballStandingRow[];
  baseballTable?: BigBallsStandingRow[];
};

/**
 * `FACT_MARKER` in `buddy-validation.ts` matches `[a-zA-Z0-9_-]+` and nothing
 * else, so an id carrying anything outside that set could never be cited.
 */
function factId(canonicalGameId: string, slug: string) {
  return `${canonicalGameId}-ctx-${slug}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

const MAX_INJURIES_PER_TEAM = 4;
const FORM_LENGTH = 5;

/**
 * A table position off one or two matchdays is noise dressed as a fact —
 * "14th on 0 points from 0 played" reads as a slump when it only means the
 * season just started. Below this, the standing is left out entirely rather
 * than qualified in prose nobody would trust anyway.
 */
const MIN_GAMES_FOR_STANDING = 3;

/**
 * The stored summary says "Real Madrid CF" where apifootball says "Real Madrid",
 * and neither vendor shares an identifier with the other, so a standings row is
 * found by name with the suffixes forgiven.
 *
 * ponytail: naive containment match. Pin a per-team id map if a third vendor
 * ever disagrees in a way this cannot bridge.
 */
function sameTeam(a: string, b: string) {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  return left === right || left.includes(right) || right.includes(left);
}

/** W/D/L from one team's perspective; undefined when the match has no score. */
function resultFor(match: ApiFootballMatch | BigBallsMatch, team: string) {
  if (match.homeScore === undefined || match.awayScore === undefined) {
    return undefined;
  }
  const isHome = sameTeam(match.homeTeam, team);
  const mine = isHome ? match.homeScore : match.awayScore;
  const theirs = isHome ? match.awayScore : match.homeScore;
  return mine > theirs ? "W" : mine < theirs ? "L" : "D";
}

function formFact(
  bundle: ContextBundle,
  team: string,
  matches: (ApiFootballMatch | BigBallsMatch)[] | undefined,
  slug: string,
): EvidenceFact | undefined {
  if (!matches?.length) return undefined;
  const recent = matches
    .slice(0, FORM_LENGTH)
    .map((match) => resultFor(match, team))
    .filter((result): result is "W" | "D" | "L" => result !== undefined);
  if (recent.length === 0) return undefined;
  return {
    id: factId(bundle.canonicalGameId, slug),
    label: `${team} recent form`,
    value: `${recent.join("")} (most recent first)`,
    valueType: "text",
    sourceId: bundle.sport === "soccer" ? "apifootball" : "bigballs",
    observedAt: bundle.observedAt,
  };
}

/**
 * Turns a gathered bundle into evidence facts. Pure, so the whole fact set is
 * unit-testable without a database or a network.
 *
 * **No fact may carry a percentage or a probability.** Both prediction feeds are
 * percentage-shaped, and the buddy is forbidden from stating one, so the lean is
 * reduced to a direction here — at the source — rather than left to the prompt
 * to remember. apifootball's own numbers are visibly rough (86/1/1 on one
 * fixture), which is a second reason not to carry them forward.
 */
export function buildFacts(bundle: ContextBundle): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  const soccer = bundle.sport === "soccer";
  const sourceId = soccer ? "apifootball" : "bigballs";

  for (const team of [bundle.homeTeam, bundle.awayTeam]) {
    // API-Sports reports a player once per injury record, so the same name can
    // arrive several times for one fixture; the reader wants the squad list,
    // not the paperwork.
    const seen = new Set<string>();
    const out = (bundle.injuries ?? []).filter((injury) => {
      if (!sameTeam(injury.team, team)) return false;
      const key = injury.player.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (out.length === 0) continue;
    const named = out
      .slice(0, MAX_INJURIES_PER_TEAM)
      .map((injury) => `${injury.player} (${injury.reason.toLowerCase()})`)
      .join(", ");
    const rest =
      out.length > MAX_INJURIES_PER_TEAM
        ? `, and ${out.length - MAX_INJURIES_PER_TEAM} more`
        : "";
    facts.push({
      id: factId(bundle.canonicalGameId, `injuries-${team}`),
      label: `${team} unavailable`,
      value: `${out.length} out: ${named}${rest}`,
      valueType: "text",
      // Injuries come from API-Sports alone; no other source carries them.
      sourceId: "api-sports",
      observedAt: bundle.observedAt,
    });
  }

  const home = formFact(bundle, bundle.homeTeam, bundle.homeForm, "form-home");
  if (home) facts.push(home);
  const away = formFact(bundle, bundle.awayTeam, bundle.awayForm, "form-away");
  if (away) facts.push(away);

  const meetings = bundle.meetings ?? [];
  if (meetings.length > 0) {
    const record = meetings.reduce(
      (acc, match) => {
        const result = resultFor(match, bundle.homeTeam);
        if (result === "W") acc.home += 1;
        else if (result === "L") acc.away += 1;
        else if (result === "D") acc.drawn += 1;
        return acc;
      },
      { home: 0, away: 0, drawn: 0 },
    );
    const latest = meetings[0];
    const lastScore =
      latest && latest.homeScore !== undefined && latest.awayScore !== undefined
        ? `; last met ${latest.homeTeam} ${latest.homeScore}-${latest.awayScore}`
        : "";
    facts.push({
      id: factId(bundle.canonicalGameId, "head-to-head"),
      label: "Head to head",
      value: `${meetings.length} recent meetings: ${bundle.homeTeam} ${record.home}, ${bundle.awayTeam} ${record.away}, drawn ${record.drawn}${lastScore}`,
      valueType: "text",
      sourceId,
      observedAt: bundle.observedAt,
    });
  }

  if (bundle.prediction) {
    const { favorite, homeWinPct, awayWinPct } = bundle.prediction;
    const named =
      favorite === "home"
        ? bundle.homeTeam
        : favorite === "away"
          ? bundle.awayTeam
          : "neither side";
    // A margin, not a number: the gap decides the wording, and the wording is
    // all that leaves this function.
    const gap = Math.abs(homeWinPct - awayWinPct);
    const strength =
      favorite === "draw"
        ? "too close to call"
        : gap > 40
          ? "clearly"
          : "narrowly";
    facts.push({
      id: factId(bundle.canonicalGameId, "model-lean"),
      label: "Model lean",
      value:
        favorite === "draw"
          ? "The model has it too close to call"
          : `The model leans ${strength} toward ${named}`,
      valueType: "text",
      sourceId: "apifootball",
      observedAt: bundle.observedAt,
    });
  }

  for (const team of [bundle.homeTeam, bundle.awayTeam]) {
    const row = bundle.soccerTable?.find((entry) => sameTeam(entry.team, team));
    if (row && row.played >= MIN_GAMES_FOR_STANDING) {
      facts.push({
        id: factId(bundle.canonicalGameId, `table-${team}`),
        label: `${team} in the table`,
        value: `${row.position} of the league on ${row.points} points from ${row.played} played, ${row.goalsFor}-${row.goalsAgainst} on goals`,
        valueType: "text",
        sourceId: "apifootball",
        observedAt: bundle.observedAt,
      });
      continue;
    }
    const baseball = bundle.baseballTable?.find((entry) =>
      sameTeam(entry.team, team),
    );
    if (!baseball || baseball.gamesPlayed < MIN_GAMES_FOR_STANDING) continue;
    const diff = baseball.runsFor - baseball.runsAgainst;
    const streak = baseball.streak
      ? `, on a ${baseball.streak.startsWith("W") ? "win" : "losing"} streak of ${baseball.streak.slice(1)}`
      : "";
    facts.push({
      id: factId(bundle.canonicalGameId, `record-${team}`),
      label: `${team} record`,
      value: `${baseball.wins}-${baseball.losses} through ${baseball.gamesPlayed} games, run differential ${diff > 0 ? "+" : ""}${diff}${streak}`,
      valueType: "text",
      sourceId: "bigballs",
      observedAt: bundle.observedAt,
    });
  }

  return facts;
}

/**
 * The condensed paragraph stored beside the facts. Assembled by template — a
 * model call here would cost money and add a second thing to validate, for prose
 * nobody reads directly.
 */
export function buildSummary(bundle: ContextBundle, facts: EvidenceFact[]) {
  if (facts.length === 0) {
    return `${bundle.homeTeam} vs ${bundle.awayTeam}: no additional context available.`;
  }
  return `${bundle.homeTeam} vs ${bundle.awayTeam}. ${facts
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join(". ")}.`;
}
