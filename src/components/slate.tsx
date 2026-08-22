import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { DemoStamp } from "@/components/demo-stamp";
import { LocalDateTime, RelativeKickoff } from "@/components/local-date-time";
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

  return (
    <>
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
          {/* One stamp per sport actually on the board — under a sport
              filter, showing both would claim freshness for data that
              isn't on the page. */}
          {sport !== "baseball" && (
            <DemoStamp compact freshness={data["real-madrid"].freshness} />
          )}
          {sport !== "soccer" && (
            <DemoStamp compact freshness={data["new-york-yankees"].freshness} />
          )}
        </div>
      </header>

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
            {filter.label}
          </Link>
        ))}
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
                  {group.label}
                </h2>
                <StatusTag>
                  {group.games.length}{" "}
                  {group.games.length === 1 ? "game" : "games"}
                </StatusTag>
              </div>
              <div className="game-list">
                {group.games.map((game, index) => (
                  <Link
                    className="game-row"
                    href={`/games/${game.id}`}
                    key={game.id}
                    aria-label={`Open ${game.homeTeam} versus ${game.awayTeam}`}
                  >
                    <div className="game-index">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="game-date">
                      <CalendarDays aria-hidden="true" size={15} />
                      <LocalDateTime value={game.scheduledAt} />
                    </div>
                    <div className="game-matchup">
                      <div className="game-opponent">
                        {game.homeTeam} vs {game.awayTeam}
                      </div>
                      <div className="game-meta">
                        {game.competition} ·{" "}
                        <RelativeKickoff value={game.scheduledAt} />
                        {/* Normally inert — the schedule holds upcoming games
                            only — but a game that finishes while still in the
                            window reads honestly instead of as a stale
                            kickoff. */}
                        {game.result &&
                          ` · Final ${game.result.homeScore}–${game.result.awayScore}`}
                      </div>
                    </div>
                    <div className="game-venue">
                      <MapPin aria-hidden="true" size={14} />{" "}
                      {game.venue ?? "Not provided"}
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
    </>
  );
}
