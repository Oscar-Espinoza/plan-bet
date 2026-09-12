import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PitchArt } from "@/components/pitch-art";
import { TeamLogo } from "@/components/team-logo";
import { clubAccentStyle } from "@/lib/club-accent";
import { teams } from "@/lib/seed";
import { gameTeamLogo } from "@/lib/team-logos";
import { Button } from "@/components/ui/button";
import { DemoStamp } from "@/components/demo-stamp";
import {
  Countdown,
  KickoffTime,
  RelativeKickoff,
  TimezoneLegend,
} from "@/components/local-date-time";
import { StatusTag } from "@/components/ui/status-tag";
import type { DashboardData } from "@/data/sports-data";
import type { GameSummary, Sport } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export type SportFilter = "all" | Sport;

const FILTERS: { value: SportFilter; label: string; href: string }[] = [
  { value: "all", label: "All", href: "/" },
  { value: "soccer", label: "Soccer", href: "/?sport=soccer" },
  { value: "baseball", label: "Baseball", href: "/?sport=baseball" },
];

// A game between two tracked teams (a Clásico, Yankees–Red Sox) is stored
// once per provider game but surfaces in *both* teams' schedules under two
// team-perspective route IDs. Both slugs set means both teams are tracked,
// so this game also appears in the other team's schedule — keep the
// home-perspective row. Live-data-only: the demo seed sets exactly one of
// the two slugs on every template, so this never fires against demo data,
// but it is not dead code — it is what keeps a Clásico from listing twice.
function isDuplicate(game: GameSummary) {
  return Boolean(
    game.homeTeamSlug &&
    game.awayTeamSlug &&
    game.teamSlug !== game.homeTeamSlug,
  );
}

function dayKey(value: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
    new Date(value),
  );
}

function dayLabel(
  value: string,
  tz: string,
  todayKey: string,
  tomorrowKey: string,
) {
  const key = dayKey(value, tz);
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function Slate({
  data,
  sport,
  tz,
}: {
  data: DashboardData;
  sport: SportFilter;
  tz: string;
}) {
  const games = Object.values(data)
    .flatMap((schedule) => schedule.games)
    .filter((game) => !isDuplicate(game))
    .filter((game) => sport === "all" || game.sport === sport)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );

  const now = new Date();
  const todayKey = dayKey(now.toISOString(), tz);
  const tomorrowKey = dayKey(
    new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    tz,
  );

  // ponytail: day headings group by the geo-header zone while the clocks below
  // them are the browser's own. They agree for anyone whose browser matches
  // their location; behind a VPN a late kickoff can land under the wrong
  // heading. Regroup client-side if that ever matters.
  const groups: { key: string; label: string; games: GameSummary[] }[] = [];
  for (const game of games) {
    const key = dayKey(game.scheduledAt, tz);
    const group = groups.at(-1);
    if (group?.key === key) {
      group.games.push(game);
    } else {
      groups.push({
        key,
        label: dayLabel(game.scheduledAt, tz, todayKey, tomorrowKey),
        games: [game],
      });
    }
  }

  const nextUp = games[0];
  // The page accent follows the tracked team of the nearest fixture, and is
  // set on the server so the club colour paints on first byte. A board with
  // nothing on it falls back to the neutral defaults in globals.css.
  const heroSide =
    nextUp && nextUp.homeTeamSlug === nextUp.teamSlug ? "home" : "away";
  const accent = clubAccentStyle(
    teams.find((team) => team.slug === nextUp?.teamSlug),
  );

  return (
    <div className="board" style={accent}>
      {nextUp ? (
        <>
          {/* The route's own name — stable across both branches, unlike the
              matchup below, which changes with the board. Visually hidden:
              .next-up-teams already carries the visual weight a page name
              would, and printing "Upcoming games" above it a second time
              would just be noise on a good day. */}
          <h1 className="sr-only">Upcoming games</h1>
          {/* The hero the club site leads with: the tracked team's own crest
              blown up behind the fixture it is about. Every word is a fact
              already on the board — day, competition, the two names, the
              venue — so nothing here is editorial copy. */}
          <section className="board-hero" aria-labelledby="next-up-heading">
            <PitchArt sport={nextUp.sport} />
            <TeamLogo src={gameTeamLogo(nextUp, heroSide)} />
            <span className="board-hero-scrim" aria-hidden="true" />
            <p className="board-hero-kicker">
              {groups[0]?.label} · {nextUp.competition}
            </p>
            <h2 className="board-hero-title" id="next-up-heading">
              {nextUp.homeTeam} v {nextUp.awayTeam}
            </h2>
            <p className="board-hero-sub">{nextUp.venue ?? "Not provided"}</p>
          </section>

          <div className="next-up" aria-labelledby="next-match-heading">
            <p className="next-up-eyebrow" id="next-match-heading">
              <span>Next</span> Match
            </p>
            <h3 className="next-up-teams">
              <span className="next-up-team">
                <TeamLogo src={gameTeamLogo(nextUp, "home")} />
                <span>{nextUp.homeTeam}</span>
              </span>
              <span className="next-up-versus">
                <span className="sr-only">versus</span>
                <span aria-hidden="true">V</span>
              </span>
              <span className="next-up-team next-up-away">
                <TeamLogo src={gameTeamLogo(nextUp, "away")} />
                <span>{nextUp.awayTeam}</span>
              </span>
            </h3>
            <div className="next-up-meta">
              <span className="next-up-meta-clock">
                <KickoffTime value={nextUp.scheduledAt} />
                <small>your time</small>
              </span>
              <span className="next-up-meta-count">
                <span className="next-up-label">Kickoff in</span>
                <span className="next-up-countdown">
                  <Countdown value={nextUp.scheduledAt} />
                </span>
                <span className="sr-only">
                  <RelativeKickoff value={nextUp.scheduledAt} />
                </span>
              </span>
            </div>
            <Button asChild>
              <Link href={`/games/${nextUp.id}`}>Open matchup</Link>
            </Button>
          </div>
          <div className="slate-freshness slate-freshness-standalone">
            {/* One stamp per sport actually on the board — under a sport
                filter, showing both would claim freshness for data that
                isn't on the page. */}
            {sport !== "baseball" && (
              <DemoStamp compact freshness={data["real-madrid"].freshness} />
            )}
            {sport !== "soccer" && (
              <DemoStamp
                compact
                freshness={data["new-york-yankees"].freshness}
              />
            )}
          </div>
        </>
      ) : (
        <header className="slate-hero">
          <div>
            <p className="eyebrow">Slate</p>
            <h1 className="display-title">Upcoming games</h1>
            <p className="page-description">
              Every tracked fixture across soccer and baseball, nearest kickoff
              first.
            </p>
          </div>
          <div className="slate-freshness">
            {sport !== "baseball" && (
              <DemoStamp compact freshness={data["real-madrid"].freshness} />
            )}
            {sport !== "soccer" && (
              <DemoStamp
                compact
                freshness={data["new-york-yankees"].freshness}
              />
            )}
          </div>
        </header>
      )}

      <nav className="slate-filters" aria-label="Filter by sport">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.href}
            className={cn(
              "slate-chip",
              sport === filter.value && "slate-chip-active",
            )}
            aria-current={sport === filter.value ? "page" : undefined}
          >
            <span>{filter.label}</span>
          </Link>
        ))}
        <TimezoneLegend />
      </nav>

      {groups.length ? (
        <div className="slate-groups">
          {groups.map((group) => (
            <section
              className="panel"
              aria-labelledby={`day-${group.key}`}
              key={group.key}
            >
              <div className="panel-header">
                <h2 className="panel-title" id={`day-${group.key}`}>
                  <span>{group.label}</span>
                </h2>
                <StatusTag>
                  {group.games.length}{" "}
                  {group.games.length === 1 ? "game" : "games"}
                </StatusTag>
              </div>
              <div className="game-list">
                {group.games.map((game) => (
                  <Link
                    className={cn(
                      "game-row",
                      game.id === nextUp?.id && "game-row-next",
                    )}
                    href={`/games/${game.id}`}
                    key={game.id}
                    aria-label={`Open ${game.homeTeam} versus ${game.awayTeam}`}
                  >
                    {/* One line, the reference's table. Competition and
                        venue left the row with the meta line: both still show
                        in the hero above and on every matchup page. */}
                    <div className="game-opponent">
                      <span className="game-team">
                        <TeamLogo src={gameTeamLogo(game, "home")} />
                        <span>{game.homeTeam}</span>
                      </span>{" "}
                      <span className="game-versus">vs</span>{" "}
                      <span className="game-team">
                        <TeamLogo src={gameTeamLogo(game, "away")} />
                        <span>{game.awayTeam}</span>
                      </span>
                      {/* Normally inert — the schedule holds upcoming games
                          only — but a game that finishes while still in the
                          window reads honestly instead of as a stale
                          kickoff. */}
                      {game.result && (
                        <span className="game-final">
                          {" "}
                          Final {game.result.homeScore}&ndash;
                          {game.result.awayScore}
                        </span>
                      )}
                    </div>
                    <div className="game-time">
                      <KickoffTime value={game.scheduledAt} />
                    </div>
                    <ChevronRight
                      className="game-chevron"
                      aria-hidden="true"
                      size={18}
                    />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel">
          <div className="mini-empty">
            <p>
              No upcoming games were provided for this filter.{" "}
              {sport !== "all" && <Link href="/">Show all sports</Link>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
