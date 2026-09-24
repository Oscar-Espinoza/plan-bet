"use client";

import { useState } from "react";
import { NavigationLink as Link } from "@/components/fast-link";
import { ChevronRight, MessageCircle, Trophy, Receipt } from "lucide-react";
import { useTranslation } from "./language-provider";
import { TeamLogo } from "./team-logo";
import { LocalDateTime } from "./local-date-time";
import { StatusTag } from "./ui/status-tag";
import { wagerSelectionLabel } from "@/lib/markets";
import { gameTeamLogo } from "@/lib/team-logos";
import type { GroupMatchActivity } from "@/lib/group-activity";

type Member = { userId: string; name: string | null };
type Standing = Member & {
  won: number;
  lost: number;
  voided: number;
  wagerCount: number;
  netReturn: number;
};

function MatchCard({
  match,
  members,
  viewerId,
}: {
  match: GroupMatchActivity;
  members: Member[];
  viewerId: string;
}) {
  const { t, formatNumber } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const first = match.bets[0]!.wager;
  const game = match.game;
  return (
    <article className="group-match-card">
      <div className="group-match-meta">
        <span>{t(game?.competition ?? first.competition)}</span>
        {game && (
          <StatusTag tone={game.status === "live" ? "positive" : "neutral"}>
            {t(game.status)}
          </StatusTag>
        )}
      </div>
      <Link className="group-match-teams" href={`/games/${first.routeId}`}>
        {game ? (
          (["home", "away"] as const).map((side) => (
            <span className="group-match-team" key={side}>
              <TeamLogo src={gameTeamLogo(game, side)} />
              <span>{side === "home" ? game.homeTeam : game.awayTeam}</span>
              {game.result && (
                <strong>
                  {side === "home"
                    ? game.result.homeScore
                    : game.result.awayScore}
                </strong>
              )}
            </span>
          ))
        ) : (
          <strong>{first.matchup}</strong>
        )}
      </Link>
      <div className="group-match-meta">
        <LocalDateTime value={game?.scheduledAt ?? first.scheduledAt} short />
        <span>
          {match.bets.length} {t(match.bets.length === 1 ? "wager" : "wagers")}
        </span>
      </div>
      <div className="group-match-picks" id={`picks-${match.canonicalGameId}`}>
        {(expanded ? match.bets : match.bets.slice(0, 3)).map(
          ({ wager, userId }) => {
            const name =
              members.find((member) => member.userId === userId)?.name ??
              t("Member");
            const selection =
              game && ["Home", "Away"].includes(wager.selectionLabel)
                ? wager.selectionId === "home"
                  ? game.homeTeam
                  : game.awayTeam
                : t(wagerSelectionLabel(wager));
            const outcome = wager.settlement?.outcome;
            return (
              <div className="group-pick" key={wager.id}>
                <div className="group-pick-top">
                  <span className="group-pick-member">
                    {name}
                    {userId === viewerId && <small>{t("You")}</small>}
                  </span>
                  <StatusTag
                    tone={
                      outcome === "won"
                        ? "positive"
                        : outcome === "lost"
                          ? "negative"
                          : "neutral"
                    }
                  >
                    {t(outcome ?? "open")}
                  </StatusTag>
                </div>
                <strong className="group-pick-selection">{selection}</strong>
                <div className="group-pick-meta">
                  <span>
                    {t(wager.marketLabel)} · {t("Odds")}{" "}
                    {formatNumber(wager.price, 2)}
                  </span>
                  <span>
                    {t("Stake")} <b>{formatNumber(wager.stake)}</b>
                  </span>
                </div>
              </div>
            );
          },
        )}
      </div>
      {match.bets.length > 3 && (
        <button
          type="button"
          className="group-expand"
          aria-expanded={expanded}
          aria-controls={`picks-${match.canonicalGameId}`}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? "Show fewer bets" : "Show all bets")}
        </button>
      )}
      <Link
        className="group-discussion-link"
        href={`/games/${first.routeId}?discussion=1#group-discussion`}
      >
        <MessageCircle size={17} aria-hidden="true" />
        {t("Match & comments")}
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </article>
  );
}

export function GroupActivity({
  matches,
  members,
  viewerId,
}: {
  matches: GroupMatchActivity[];
  members: Member[];
  viewerId: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="group-feed" aria-labelledby="group-wagers-heading">
      <h2 className="group-section-title" id="group-wagers-heading">
        {t("Recent activity")}
      </h2>
      <details className="group-comment-note">
        <summary>{t("About comments")}</summary>
        <p>
          {t(
            "Comments live on each match page. Place a group bet on that match to join its discussion.",
          )}
        </p>
      </details>
      {matches.length ? (
        <div className="group-match-list">
          {matches.map((match) => (
            <MatchCard
              key={match.canonicalGameId}
              match={match}
              members={members}
              viewerId={viewerId}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div>
            <span className="empty-icon">
              <Receipt aria-hidden="true" />
            </span>
            <h3 className="empty-title">{t("No wagers yet")}</h3>
            <p className="empty-copy">
              {t("Place a wager with this group from a game page.")}
            </p>
            <Link href="/" className="button button-secondary button-sm mt-4">
              {t("Games")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

export function GroupStandings({
  entries,
  viewerId,
}: {
  entries: Standing[];
  viewerId: string;
}) {
  const { t, formatNumber } = useTranslation();
  return (
    <section className="group-standings" aria-labelledby="leaderboard-heading">
      <div className="group-standings-heading">
        <h2 className="group-section-title" id="leaderboard-heading">
          <Trophy size={18} aria-hidden="true" />
          {t("Leaderboard")}
        </h2>
        <span>{t("Net credits")}</span>
      </div>
      <ol>
        {entries.map((entry, index) => (
          <li
            key={entry.userId}
            className={
              entry.userId === viewerId ? "group-standing-current" : undefined
            }
          >
            <span className="group-rank">{index + 1}</span>
            <div className="group-standing-person">
              <strong>
                {entry.name ?? t("Member")}
                {entry.userId === viewerId && <small>{t("You")}</small>}
              </strong>
              <span>
                {t("Won {p0} · Lost {p1} · Void {p2}", {
                  p0: entry.won,
                  p1: entry.lost,
                  p2: entry.voided,
                })}
              </span>
              <span>
                {entry.wagerCount}{" "}
                {t(entry.wagerCount === 1 ? "wager" : "wagers")}
              </span>
            </div>
            <strong
              className="group-standing-net"
              data-positive={entry.netReturn > 0}
            >
              {entry.netReturn > 0 ? "+" : ""}
              {formatNumber(entry.netReturn)}
            </strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
