"use client";
import { useTranslation } from "@/components/language-provider";
import { Countdown, LocalDateTime } from "@/components/local-date-time";
import { TeamLogo } from "@/components/team-logo";
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
export function Scorebug({
  identity,
  timing,
}: Pick<MatchView, "identity" | "timing">) {
  const { t } = useTranslation();
  const { homeTeam, awayTeam, trackedSide, clubColor, competition, stage } =
    identity;
  const { result, scheduledAt, venue, status } = timing;

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
        {which === "home" ? t("Home") : t("Away")}
      </span>
      <span className="mp-side-team">
        <TeamLogo
          priority
          src={which === "home" ? identity.homeTeamLogo : identity.awayTeamLogo}
        />
        <span className="mp-side-name">{name}</span>
      </span>
    </div>
  );

  return (
    <header className="mp-bug">
      {/* The playing surface behind the scorebug, under a scrim. Decorative:
          every figure over it keeps its own contrast. */}
      <span className="mp-bug-scrim" aria-hidden="true" />
      <span className="mp-status-pill">
        {status === "finished"
          ? t("Full time")
          : status === "live"
            ? t("Live")
            : status === "postponed"
              ? t("Postponed")
              : status === "cancelled"
                ? t("Cancelled")
                : t("Next match")}
      </span>
      <p className="mp-comp">
        <span>{t(competition)}</span>
        {stage && <span className="mp-comp-stage">{t(stage)}</span>}
      </p>

      <div className="mp-sides" data-played={result ? "" : undefined}>
        {side(homeTeam, "home")}
        <span className="mp-scoreline" aria-hidden="true">
          {result ? (
            <>
              <strong className="mp-side-score">{result.homeScore}</strong>
              <span>–</span>
              <strong className="mp-side-score">{result.awayScore}</strong>
            </>
          ) : (
            <span>VS</span>
          )}
        </span>
        {side(awayTeam, "away")}
      </div>

      {result?.completion === "extra" && (
        <p className="mp-aftermath">{t("After extra time")}</p>
      )}
      {result?.completion === "shootout" && (
        <p className="mp-aftermath">{t("After penalties")}</p>
      )}

      {!result && (
        <div className="mp-clock">
          <span className="mp-clock-label">{t("Kickoff in")}</span>
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
