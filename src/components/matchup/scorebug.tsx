import { Countdown, LocalDateTime } from "@/components/local-date-time";
import type { MatchView } from "@/lib/game-view";

/**
 * The whole reason to open this page: who is playing, and how long you have
 * to decide. Everything else on the screen is subordinate to these two facts,
 * so they get the full width and the only two type sizes above 2rem.
 *
 * The club colour is a stripe on the tracked side alone — the opponent is
 * usually not a tracked team and has no colour of its own, and inventing one
 * would be inventing data.
 */
export function Scorebug({ identity, timing }: MatchView) {
  const { homeTeam, awayTeam, trackedSide, clubColor, competition, stage } =
    identity;
  const { result, scheduledAt, venue } = timing;

  const side = (name: string, which: "home" | "away") => (
    <div
      className="mp-side"
      data-tracked={which === trackedSide || undefined}
      style={
        which === trackedSide
          ? ({ "--mp-club": clubColor } as React.CSSProperties)
          : undefined
      }
    >
      <span className="mp-side-label">
        {which === "home" ? "Home" : "Away"}
      </span>
      <span className="mp-side-name">{name}</span>
      {result && (
        <span className="mp-side-score">
          {which === "home" ? result.homeScore : result.awayScore}
        </span>
      )}
    </div>
  );

  return (
    <header className="mp-bug">
      <p className="mp-comp">
        <span>{competition}</span>
        {stage && <span className="mp-comp-stage">{stage}</span>}
      </p>

      <div className="mp-sides" data-played={result ? "" : undefined}>
        {side(homeTeam, "home")}
        {!result && <span className="mp-versus" aria-hidden="true" />}
        {side(awayTeam, "away")}
      </div>

      {result?.completion === "extra" && (
        <p className="mp-aftermath">After extra time</p>
      )}
      {result?.completion === "shootout" && (
        <p className="mp-aftermath">After penalties</p>
      )}

      {!result && (
        <div className="mp-clock">
          <span className="mp-clock-label">Kickoff in</span>
          <strong className="mp-clock-figure">
            <Countdown value={scheduledAt} />
          </strong>
        </div>
      )}

      <div className="mp-when">
        <LocalDateTime value={scheduledAt} />
        {venue && <span className="mp-venue">{venue}</span>}
      </div>
    </header>
  );
}
