"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  MapPin,
} from "lucide-react";
import { DemoStamp } from "@/components/demo-stamp";
import { LocalDateTime } from "@/components/local-date-time";
import { TeamMark } from "@/components/team-mark";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import {
  generateGames,
  getSnapshot,
  getTeam,
  getTeamsBySport,
} from "@/lib/seed";
import { useMatchdayStore } from "@/lib/store";
import type { Sport } from "@/lib/contracts";
import { cn } from "@/lib/utils";

function FormStrip({ form }: { form: ("W" | "D" | "L")[] }) {
  return (
    <div className="form-strip" aria-label={`Recent form: ${form.join(", ")}`}>
      {form.map((result, index) => (
        <span
          className={cn("form-result", `form-${result.toLowerCase()}`)}
          key={`${result}-${index}`}
        >
          {result}
        </span>
      ))}
    </div>
  );
}

export function Dashboard() {
  const selectedSport = useMatchdayStore((state) => state.selectedSport);
  const selectedTeamSlug = useMatchdayStore((state) => state.selectedTeamSlug);
  const selectSport = useMatchdayStore((state) => state.selectSport);
  const selectTeam = useMatchdayStore((state) => state.selectTeam);
  const watchlistItems = useMatchdayStore((state) => state.watchlistItems);
  const team = getTeam(selectedTeamSlug)!;
  const games = generateGames(selectedTeamSlug);
  const context = getSnapshot(games[0].id)!.context;
  const relevantItems = watchlistItems.filter(
    (item) => item.teamSlug === selectedTeamSlug && item.status === "open",
  );

  return (
    <>
      <header className="dashboard-hero">
        <div className="hero-main">
          <TeamMark team={team} size="lg" />
          <div>
            <p className="eyebrow">Next five · {team.sport}</p>
            <h1 className="display-title">{team.name}</h1>
            <p className="page-description">
              A focused preparation desk for the fixtures ahead—schedule,
              context, personal checks, and an evidence-linked example brief.
            </p>
          </div>
        </div>
        <DemoStamp />
      </header>

      <div className="mobile-workspace-switcher panel">
        <div>
          <span className="field-label">Sport</span>
          <div
            className="dashboard-sport-toggle"
            aria-label="Select dashboard sport"
          >
            {(["soccer", "baseball"] as Sport[]).map((sport) => (
              <button
                className={cn(
                  "dashboard-sport-button",
                  selectedSport === sport && "dashboard-sport-active",
                )}
                key={sport}
                onClick={() => selectSport(sport)}
                aria-pressed={selectedSport === sport}
              >
                {sport === "soccer" ? "Soccer" : "Baseball"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label">Team</span>
          <div className="team-tabs">
            {getTeamsBySport(selectedSport).map((option) => (
              <button
                className={cn(
                  "team-tab",
                  option.slug === team.slug && "team-tab-active",
                )}
                key={option.slug}
                onClick={() => selectTeam(option.slug)}
                aria-pressed={option.slug === team.slug}
              >
                <TeamMark team={option} size="sm" />
                {option.shortName}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <section
          className="panel schedule-panel"
          aria-labelledby="schedule-heading"
        >
          <div className="panel-header">
            <div>
              <p className="eyebrow">Schedule</p>
              <h2 className="panel-title" id="schedule-heading">
                Upcoming games
              </h2>
            </div>
            <StatusTag tone="positive">5 scheduled</StatusTag>
          </div>
          <div className="game-list">
            {games.map((game, index) => {
              const isHome = game.homeTeamSlug === team.slug;
              const opponent = isHome ? game.awayTeam : game.homeTeam;
              return (
                <Link
                  className="game-row"
                  href={`/games/${game.id}`}
                  key={game.id}
                  aria-label={`Open ${team.shortName} versus ${opponent}`}
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
                      <span className="game-site">{isHome ? "vs" : "at"}</span>{" "}
                      {opponent}
                    </div>
                    <div className="game-meta">{game.competition}</div>
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
              );
            })}
          </div>
        </section>

        <aside className="dashboard-side">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Current read</h2>
              <span className="fine-print">Demo values</span>
            </div>
            <div className="stat-stack">
              <div className="stat-row">
                <span>{context.kind === "soccer" ? "Table" : "Division"}</span>
                <strong>
                  #
                  {context.kind === "soccer"
                    ? context.tablePosition
                    : context.divisionRank}
                </strong>
              </div>
              <div className="stat-row">
                <span>Record</span>
                <strong>{context.record}</strong>
              </div>
              {context.kind === "soccer" ? (
                <div className="stat-row">
                  <span>Points</span>
                  <strong>{context.points}</strong>
                </div>
              ) : (
                <div className="stat-row">
                  <span>Last ten</span>
                  <strong>{context.lastTen}</strong>
                </div>
              )}
              <div className="form-block">
                <span>Recent form</span>
                <FormStrip form={context.recentForm} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Watchlist</h2>
              <StatusTag>{relevantItems.length} open</StatusTag>
            </div>
            {relevantItems.length ? (
              <div className="watch-summary">
                {relevantItems.slice(0, 3).map((item) => (
                  <div className="watch-summary-item" key={item.id}>
                    <ClipboardCheck aria-hidden="true" size={15} />
                    <span>{item.text}</span>
                  </div>
                ))}
                <Button
                  asChild
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  <Link href="/watchlist">
                    Review all <ArrowUpRight aria-hidden="true" size={14} />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="mini-empty">
                <p>No open checks for {team.shortName}.</p>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/watchlist">Add a watchlist item</Link>
                </Button>
              </div>
            )}
          </section>

          <section className="freshness-panel">
            <div>
              <span className="freshness-dot" />
              <strong>Demo source ready</strong>
            </div>
            <p>
              Date-relative schedules refresh when the app loads. Context values
              are designed examples, not live provider data.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
