"use client";

import { useSearchParams } from "next/navigation";
import { LocalLink, MatchLink } from "@/components/fast-link";
import type { PreviewMetadata } from "@/components/navigation-preview";
import { useTranslation } from "@/components/language-provider";
import { intlLocale, type Locale } from "@/lib/locale";
import { NavigationLink as Link } from "@/components/fast-link";
import { CalendarDays, ChevronRight, Radio } from "lucide-react";
import { TeamLogo } from "@/components/team-logo";
import { clubAccentStyle } from "@/lib/club-accent";
import { gameTeamLogo } from "@/lib/team-logos";
import { Button } from "@/components/ui/button";
import { DemoStamp } from "@/components/demo-stamp";
import {
  KickoffTime,
  LocalDateTime,
  RelativeKickoff,
  TimezoneLegend,
} from "@/components/local-date-time";
import { StatusTag } from "@/components/ui/status-tag";
import type {
  GameSchedule,
  GameSummary,
  Sport,
  TeamSlug,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

export type SportFilter = "all" | Sport;

/** What the board renders — a team's `context` stays on the server. */
export type BoardData = Record<
  TeamSlug,
  Pick<GameSchedule, "team" | "games" | "freshness">
>;

function matchPreview(game: GameSummary, data: BoardData): PreviewMetadata {
  const team = data[game.teamSlug].team;
  return {
    match: {
      identity: {
        sport: game.sport,
        competition: game.competition,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeTeamLogo: gameTeamLogo(game, "home"),
        awayTeamLogo: gameTeamLogo(game, "away"),
        trackedSide: game.homeTeamSlug === team.slug ? "home" : "away",
        clubColor: team.colors.primary,
      },
      timing: {
        scheduledAt: game.scheduledAt,
        status: game.status,
        result: game.result,
        venue: game.venue?.trim() || undefined,
      },
    },
  };
}

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
  locale: Locale,
) {
  const key = dayKey(value, tz);
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function Slate({
  data,
  sport: _initialSport,
  tz,
}: {
  data: BoardData;
  sport: SportFilter;
  tz: string;
}) {
  const { t, locale } = useTranslation();
  const params = useSearchParams();
  const filter = params ? (params.get("sport") ?? "all") : _initialSport;
  const sport: SportFilter =
    filter === "soccer" || filter === "baseball" ? filter : "all";
  const games = Object.values(data)
    .flatMap((schedule) => schedule.games)
    .filter((game) => !isDuplicate(game))
    .filter((game) => sport === "all" || game.sport === sport)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  const liveGames = games.filter((game) => game.status === "live");
  const scheduledGames = games.filter((game) => game.status !== "live");

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
  for (const game of scheduledGames) {
    const key = dayKey(game.scheduledAt, tz);
    const group = groups.at(-1);
    if (group?.key === key) {
      group.games.push(game);
    } else {
      groups.push({
        key,
        label: dayLabel(game.scheduledAt, tz, todayKey, tomorrowKey, locale),
        games: [game],
      });
    }
  }

  const nextUp = scheduledGames[0] ?? liveGames[0];
  // The page accent follows the tracked team of the nearest fixture, and is
  // set on the server so the club colour paints on first byte. A board with
  // nothing on it falls back to the neutral defaults in globals.css.
  const accent = clubAccentStyle(
    nextUp ? data[nextUp.teamSlug]?.team : undefined,
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
          <h1 className="sr-only">{t("Upcoming games")}</h1>
          <div className="next-up" aria-labelledby="next-match-heading">
            <div className="next-up-header">
              <p className="next-up-eyebrow" id="next-match-heading">
                {t("Next match")}{" "}
              </p>
              <RelativeKickoff value={nextUp.scheduledAt} />
            </div>
            <h3 className="next-up-teams">
              <span className="next-up-team">
                <TeamLogo priority src={gameTeamLogo(nextUp, "home")} />
                <span>{nextUp.homeTeam}</span>
              </span>
              <span className="next-up-versus">
                <span className="sr-only">{t("versus")}</span>
                <span aria-hidden="true">VS</span>
              </span>
              <span className="next-up-team next-up-away">
                <TeamLogo priority src={gameTeamLogo(nextUp, "away")} />
                <span>{nextUp.awayTeam}</span>
              </span>
            </h3>
            <div className="next-up-detail">
              <span>{t(nextUp.competition)}</span>
              <LocalDateTime value={nextUp.scheduledAt} />
            </div>
            <Button asChild className="next-up-cta">
              <MatchLink
                eager
                href={`/games/${nextUp.id}`}
                preview={matchPreview(nextUp, data)}
              >
                {t("View Match & Place Bet")}{" "}
                <ChevronRight aria-hidden="true" size={20} />
              </MatchLink>
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
            <p className="eyebrow">{t("Slate")}</p>
            <h1 className="display-title">{t("Upcoming games")}</h1>
            <p className="page-description">
              {t(
                "Every tracked fixture across soccer and baseball, nearest kickoff first.",
              )}{" "}
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

      <nav className="slate-filters" aria-label={t("Filter by sport")}>
        {FILTERS.map((filter) => (
          <LocalLink
            key={filter.value}
            href={filter.href}
            className={cn(
              "slate-chip",
              sport === filter.value && "slate-chip-active",
            )}
            aria-current={sport === filter.value ? "page" : undefined}
          >
            <span>{t(filter.label)}</span>
          </LocalLink>
        ))}
        <TimezoneLegend />
      </nav>

      {liveGames.length > 0 && (
        <section className="live-section" aria-labelledby="live-now-heading">
          <div className="section-heading">
            <h2 id="live-now-heading">
              <Radio aria-hidden="true" />
              {t("Live Now")}{" "}
            </h2>
            <StatusTag>
              {liveGames.length}{" "}
              {liveGames.length === 1 ? t("Game") : t("Games")}
            </StatusTag>
          </div>
          <div className="game-list live-game-list">
            {liveGames.map((game) => (
              <MatchLink
                className="game-row game-row-live"
                href={`/games/${game.id}`}
                preview={matchPreview(game, data)}
                key={game.id}
              >
                <span className="game-time">{t("LIVE")}</span>
                <span className="game-matchup-stacked">
                  <span className="game-team">
                    <TeamLogo src={gameTeamLogo(game, "home")} />
                    {game.homeTeam}
                  </span>
                  <span className="game-team">
                    <TeamLogo src={gameTeamLogo(game, "away")} />
                    {game.awayTeam}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="game-chevron" />
              </MatchLink>
            ))}
          </div>
        </section>
      )}

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
                  <CalendarDays aria-hidden="true" />
                  <span>{t(group.label)}</span>
                </h2>
                <StatusTag>
                  {group.games.length}{" "}
                  {group.games.length === 1 ? t("game") : t("games")}
                </StatusTag>
              </div>
              <div className="game-list">
                {group.games.map((game) => (
                  <MatchLink
                    className={cn(
                      "game-row",
                      game.id === nextUp?.id && "game-row-next",
                    )}
                    href={`/games/${game.id}`}
                    preview={matchPreview(game, data)}
                    key={game.id}
                    aria-label={t("Open {p0} versus {p1}", {
                      p0: game.homeTeam,
                      p1: game.awayTeam,
                    })}
                  >
                    <div className="game-time">
                      <KickoffTime value={game.scheduledAt} />
                    </div>
                    <div className="game-opponent game-matchup-stacked">
                      <span className="game-team">
                        <TeamLogo src={gameTeamLogo(game, "home")} />
                        <span>{game.homeTeam}</span>
                      </span>
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
                          {t("Final")} {game.result.homeScore}&ndash;
                          {game.result.awayScore}
                        </span>
                      )}
                    </div>
                    <ChevronRight
                      className="game-chevron"
                      aria-hidden="true"
                      size={18}
                    />
                  </MatchLink>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel">
          <div className="mini-empty">
            <p>
              {t("No upcoming games were provided for this filter.")}{" "}
              {sport !== "all" && <Link href="/">{t("Show all sports")}</Link>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
