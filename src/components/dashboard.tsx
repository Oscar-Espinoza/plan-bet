"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { DemoStamp } from "@/components/demo-stamp";
import { LocalDateTime } from "@/components/local-date-time";
import { TeamMark } from "@/components/team-mark";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { getTeamsBySport } from "@/lib/seed";
import { useMatchdayStore } from "@/lib/store";
import type { Sport } from "@/lib/contracts";
import type { DashboardData } from "@/data/sports-data";
import { cn } from "@/lib/utils";

function FormStrip({ form }: { form: ("W" | "D" | "L")[] }) {
  return (
    <div
      className="form-strip"
      role="group"
      aria-label={`Recent form: ${form.join(", ")}`}
    >
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

function decimal(value: number) {
  return value.toFixed(3).replace(/^0/, "");
}

export function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const selectedSport = useMatchdayStore((state) => state.selectedSport);
  const selectedTeamSlug = useMatchdayStore((state) => state.selectedTeamSlug);
  const selectSport = useMatchdayStore((state) => state.selectSport);
  const selectTeam = useMatchdayStore((state) => state.selectTeam);
  const schedule = data[selectedTeamSlug];
  const { team, games, context, freshness } = schedule;

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
        <DemoStamp freshness={freshness} />
      </header>

      <div className="mobile-workspace-switcher panel">
        <div>
          <span className="field-label">Sport</span>
          <div
            className="dashboard-sport-toggle"
            role="group"
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
            <StatusTag
              tone={freshness.mode === "stale" ? "warning" : "positive"}
            >
              {games.length} {games.length === 1 ? "game" : "games"}
            </StatusTag>
          </div>
          <div className="game-list">
            {games.length ? (
              games.map((game, index) => {
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
                        <span className="game-site">
                          {isHome ? "vs" : "at"}
                        </span>{" "}
                        {opponent}
                      </div>
                      <div className="game-meta">
                        {game.competition}
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
                );
              })
            ) : (
              <div className="mini-empty">
                <p>No upcoming games were provided for this team.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="dashboard-side" aria-label="Team overview">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Current read</h2>
              <span className="fine-print">{freshness.attribution.name}</span>
            </div>
            <div className="stat-stack">
              <div className="stat-row">
                <span>{context.kind === "soccer" ? "Table" : "Division"}</span>
                <strong>
                  {context.kind === "soccer"
                    ? context.tablePosition
                      ? `#${context.tablePosition}`
                      : "Not provided"
                    : context.divisionRank
                      ? `#${context.divisionRank}`
                      : "Not provided"}
                </strong>
              </div>
              <div className="stat-row">
                <span>Record</span>
                <strong>{context.record ?? "Not provided"}</strong>
              </div>
              {context.kind === "soccer" ? (
                <div className="stat-row">
                  <span>Points</span>
                  <strong>{context.points ?? "Not provided"}</strong>
                </div>
              ) : (
                <div className="stat-row">
                  <span>Last ten</span>
                  <strong>{context.lastTen ?? "Not provided"}</strong>
                </div>
              )}
              <div className="form-block">
                <span>Recent form</span>
                {context.recentForm.length ? (
                  <FormStrip form={context.recentForm} />
                ) : (
                  <span className="not-provided">Not provided</span>
                )}
              </div>
              {context.kind === "baseball" &&
                (context.statcast?.trackedTeam ? (
                  <>
                    <div className="stat-row">
                      <span>Statcast season</span>
                      <strong>{context.statcast.trackedTeam.season}</strong>
                    </div>
                    <div className="stat-row">
                      <span>BA / xBA</span>
                      <strong>
                        {decimal(context.statcast.trackedTeam.battingAverage)} /{" "}
                        {decimal(
                          context.statcast.trackedTeam.expectedBattingAverage,
                        )}
                      </strong>
                    </div>
                    <div className="stat-row">
                      <span>wOBA / xwOBA</span>
                      <strong>
                        {decimal(context.statcast.trackedTeam.woba)} /{" "}
                        {decimal(context.statcast.trackedTeam.expectedWoba)}
                      </strong>
                    </div>
                  </>
                ) : (
                  <div className="stat-row">
                    <span>Statcast batting</span>
                    <strong>Not provided</strong>
                  </div>
                ))}
            </div>
          </section>

          <section className="freshness-panel" data-mode={freshness.mode}>
            <div>
              <span className="freshness-dot" />
              <strong>
                {freshness.mode === "live"
                  ? `Live ${team.sport} cache ready`
                  : freshness.mode === "stale"
                    ? "Using last-known-good data"
                    : "Demo fallback ready"}
              </strong>
            </div>
            <p>
              Source: {freshness.attribution.name}. Fetched{" "}
              <LocalDateTime value={freshness.fetchedAt} short />.
            </p>
            {freshness.mode !== "live" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.refresh()}
              >
                <RefreshCw aria-hidden="true" size={14} /> Retry live data
              </Button>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
