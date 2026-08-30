"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  Library,
  MapPin,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import { DemoStamp } from "@/components/demo-stamp";
import { LocalDateTime, RelativeKickoff } from "@/components/local-date-time";
import { TeamMark } from "@/components/team-mark";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import type { GameDetailData, StatcastBatting, Team } from "@/lib/contracts";
import { isLegacyBaseballGameId } from "@/lib/utils";

function Provided({ value }: { value?: string }) {
  return (
    <>
      {value?.trim() ? (
        value
      ) : (
        <span className="not-provided">Not provided</span>
      )}
    </>
  );
}

function decimal(value: number) {
  return value.toFixed(3).replace(/^0/, "");
}

function StatcastLine({
  label,
  value,
}: {
  label: string;
  value: StatcastBatting;
}) {
  return (
    <div className="pitcher-card">
      <span>
        {label} · {value.season}
      </span>
      <strong>{value.team}</strong>
      <small>
        {value.plateAppearances} PA · {value.ballsInPlay} BIP
      </small>
      <small>
        BA {decimal(value.battingAverage)} / xBA{" "}
        {decimal(value.expectedBattingAverage)} · SLG {decimal(value.slugging)}{" "}
        / xSLG {decimal(value.expectedSlugging)}
      </small>
      <small>
        wOBA {decimal(value.woba)} / xwOBA {decimal(value.expectedWoba)}
      </small>
    </div>
  );
}

export function GameDetail({
  data,
  team,
  wagering,
}: {
  data: GameDetailData;
  team: Team;
  // Optional so game-detail.test.tsx keeps compiling without wiring it.
  // Absent entirely when sign-in isn't configured — matches AccountControl.
  wagering?: WagerPanelData;
}) {
  const router = useRouter();
  const { snapshot } = data;
  const { game, context, evidenceFacts, sources, freshness } = snapshot;
  const isHome = game.homeTeamSlug === team.slug;
  const archivedDemo =
    game.sport === "baseball" &&
    freshness.mode === "demo" &&
    isLegacyBaseballGameId(game.id);

  return (
    <>
      <h1 className="sr-only">
        {game.result
          ? `${game.homeTeam} ${game.result.homeScore} – ${game.result.awayScore} ${game.awayTeam}, final`
          : `${game.homeTeam} vs ${game.awayTeam}`}
      </h1>
      <Link href="/" className="back-link">
        <ArrowLeft aria-hidden="true" size={15} /> Back to games
      </Link>
      <header className="matchup-header panel">
        <div className="matchup-topline">
          <div>
            <StatusTag
              tone={
                game.status === "cancelled"
                  ? "warning"
                  : game.status === "postponed" || freshness.mode === "stale"
                    ? "warning"
                    : "positive"
              }
            >
              {game.status[0]!.toUpperCase() + game.status.slice(1)}
            </StatusTag>
            <span className="competition-label">{game.competition}</span>
            {archivedDemo && (
              <StatusTag tone="warning">Archived demo item</StatusTag>
            )}
          </div>
          <DemoStamp compact freshness={freshness} />
        </div>
        <div className="matchup-scoreboard">
          <div className="matchup-team">
            {isHome && <TeamMark team={team} size="lg" />}
            <span className="matchup-team-name">{game.homeTeam}</span>
            <span className="matchup-side">Home</span>
          </div>
          <div className="matchup-vs">
            {/* The score takes the "vs" slot on a finished game, so a played
                fixture reads as played instead of showing only a kickoff time
                that has passed. `.matchup-vs > span` already styles it. */}
            <span>
              {game.result
                ? `${game.result.homeScore} – ${game.result.awayScore}`
                : "vs"}
            </span>
            {game.result?.completion === "extra" && "After extra time"}
            {game.result?.completion === "shootout" && "After penalties"}
            {/* Countdown, not a second copy of the kickoff stamp — the full
                local date and time is already one row below in
                `.matchup-details`. Sodium, because it is time. */}
            {!game.result && (
              <em className="matchup-countdown">
                <RelativeKickoff value={game.scheduledAt} />
              </em>
            )}
          </div>
          <div className="matchup-team matchup-team-away">
            {!isHome && <TeamMark team={team} size="lg" />}
            <span className="matchup-team-name">{game.awayTeam}</span>
            <span className="matchup-side">Away</span>
          </div>
        </div>
        <div className="matchup-details">
          <span>
            <Clock3 aria-hidden="true" size={15} />
            <LocalDateTime value={game.scheduledAt} />
          </span>
          <span>
            <MapPin aria-hidden="true" size={15} />
            <Provided value={game.venue} />
          </span>
        </div>
      </header>

      {/* The action comes first in the DOM, so on a phone the thing you came
          to do is above the reading material rather than three screens under
          it. Above 1100px the same node is placed into the right column by
          grid, without a second render order for assistive tech. */}
      <div className="detail-layout">
        {/* Absent, not empty, when sign-in isn't configured: an empty aside
            still claims a grid track and a gap. */}
        {wagering && (
          <aside className="detail-side" aria-label="Place a bet">
            <BetSlip data={wagering} />
          </aside>
        )}

        <div className="detail-primary">
          <section className="panel" aria-labelledby="context-heading">
            <div className="panel-header">
              <div>
                <h2 className="panel-title" id="context-heading">
                  The read
                </h2>
                <p className="panel-purpose">
                  Form, standing and availability — the facts the brief below is
                  built from.
                </p>
              </div>
            </div>
            {context.kind === "soccer" ? (
              <div className="context-body">
                <div className="context-stats">
                  <div>
                    <span>Table</span>
                    <strong>
                      {context.tablePosition
                        ? `#${context.tablePosition}`
                        : "Not provided"}
                    </strong>
                  </div>
                  <div>
                    <span>Points</span>
                    <strong>{context.points ?? "Not provided"}</strong>
                  </div>
                  <div>
                    <span>Record</span>
                    <strong>{context.record ?? "Not provided"}</strong>
                  </div>
                  <div>
                    <span>Last five</span>
                    <strong>
                      {context.recentForm.length
                        ? context.recentForm.join(" · ")
                        : "Not provided"}
                    </strong>
                  </div>
                </div>
                <div className="context-columns">
                  <div>
                    <h3>Availability</h3>
                    {context.availability.length ? (
                      context.availability.map((entry) => (
                        <div className="availability-row" key={entry.name}>
                          <span>
                            <b>{entry.name}</b>
                            <small>{entry.note ?? "No additional note"}</small>
                          </span>
                          <StatusTag
                            tone={
                              entry.status === "Available"
                                ? "positive"
                                : "warning"
                            }
                          >
                            {entry.status}
                          </StatusTag>
                        </div>
                      ))
                    ) : (
                      <p className="not-provided">Not provided</p>
                    )}
                  </div>
                  <div>
                    <h3>Matchup notes</h3>
                    {context.matchupNotes.length ? (
                      <ul className="context-notes">
                        {context.matchupNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="not-provided">Not provided</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="context-body">
                <div className="context-stats">
                  <div>
                    <span>Division</span>
                    <strong>
                      {context.divisionRank
                        ? `#${context.divisionRank}`
                        : "Not provided"}
                    </strong>
                  </div>
                  <div>
                    <span>Record</span>
                    <strong>{context.record ?? "Not provided"}</strong>
                  </div>
                  <div>
                    <span>Last ten</span>
                    <strong>{context.lastTen ?? "Not provided"}</strong>
                  </div>
                  <div>
                    <span>Last five</span>
                    <strong>
                      {context.recentForm.length
                        ? context.recentForm.join(" · ")
                        : "Not provided"}
                    </strong>
                  </div>
                </div>
                {context.probablePitchers.length ? (
                  <div className="pitcher-grid">
                    {context.probablePitchers.map((pitcher) => (
                      <div className="pitcher-card" key={pitcher.team}>
                        <span>{pitcher.team} probable</span>
                        <strong>
                          <Provided value={pitcher.name} />
                        </strong>
                        <small>
                          Throws <Provided value={pitcher.throws} /> · ERA{" "}
                          <Provided value={pitcher.era} />
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="not-provided">
                    Probable pitchers: Not provided
                  </p>
                )}
                {context.statcast?.trackedTeam || context.statcast?.opponent ? (
                  <div className="pitcher-grid">
                    {context.statcast.trackedTeam && (
                      <StatcastLine
                        label="Tracked team Statcast batting"
                        value={context.statcast.trackedTeam}
                      />
                    )}
                    {context.statcast.opponent && (
                      <StatcastLine
                        label="Opponent Statcast batting"
                        value={context.statcast.opponent}
                      />
                    )}
                  </div>
                ) : (
                  <p className="not-provided">
                    Statcast expected batting: Not provided
                  </p>
                )}
                <div className="context-columns">
                  <div>
                    <h3>Batting splits</h3>
                    <div className="data-pair">
                      <span>vs LHP</span>
                      <b>
                        <Provided value={context.splits?.vsLeft} />
                      </b>
                    </div>
                    <div className="data-pair">
                      <span>vs RHP</span>
                      <b>
                        <Provided value={context.splits?.vsRight} />
                      </b>
                    </div>
                  </div>
                  <div>
                    <h3>Availability & matchup</h3>
                    {context.availability.length ? (
                      context.availability.map((entry) => (
                        <div className="availability-row" key={entry.name}>
                          <span>
                            <b>{entry.name}</b>
                            <small>{entry.note ?? "No additional note"}</small>
                          </span>
                          <StatusTag tone="warning">{entry.status}</StatusTag>
                        </div>
                      ))
                    ) : (
                      <p className="not-provided">Availability: Not provided</p>
                    )}
                    {context.matchupNotes?.length ? (
                      <ul className="context-notes">
                        {context.matchupNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="not-provided">
                        Matchup notes: Not provided
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Lifted out of the deleted brief panel: the numbered fact list is
              what every other number on this page is drawn from, so it stays
              a disclosure of its own rather than leaving with the prose. */}
          <details className="panel evidence-disclosure">
            <summary>
              <span>
                <ShieldCheck aria-hidden="true" size={17} /> Data used ·{" "}
                {evidenceFacts.length} facts
              </span>
              <ChevronDown aria-hidden="true" size={17} />
            </summary>
            <div className="evidence-list">
              {evidenceFacts.map((fact, index) => (
                <div key={fact.id}>
                  <span>
                    <b className="brief-ref">[{index + 1}]</b> {fact.label}
                  </span>
                  <strong>
                    {fact.valueType === "datetime" ? (
                      <LocalDateTime value={fact.value} />
                    ) : (
                      fact.value
                    )}
                  </strong>
                  <small>Ref: {fact.id}</small>
                </div>
              ))}
            </div>
          </details>

          {/* Reference material, not reading material: collapsed by default
              so it costs one row of scroll instead of a screen of it. */}
          <details className="panel evidence-disclosure">
            <summary>
              <span>
                <Library aria-hidden="true" size={17} /> Sources ·{" "}
                {sources.length}{" "}
                {sources.length === 1 ? "reference" : "references"}
              </span>
              <ChevronDown aria-hidden="true" size={17} />
            </summary>
            <div className="source-list">
              {sources.map((source) => (
                <div key={source.id}>
                  <span className="source-index">
                    {String(sources.indexOf(source) + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.name}
                        </a>
                      ) : (
                        source.name
                      )}
                    </strong>
                    <p>{source.description}</p>
                  </div>
                  <LocalDateTime value={source.observedAt} short />
                </div>
              ))}
            </div>
          </details>

          <div className="side-disclaimer">
            <strong>Where these numbers come from</strong>
            <p>
              Every fact on this page is read from the validated provider
              snapshot above — nothing is inferred and nothing is padded. Prices
              on this page are fictional house prices published by this app for
              a free-to-play simulator — not bookmaker odds, not a prediction,
              and not betting advice. No real money is involved and nothing is
              withdrawable; see the <Link href="/rules">rules</Link> for how
              markets settle.
            </p>
            {archivedDemo && (
              <p>
                This stable legacy route is preserved as an archived demo item.
              </p>
            )}
            {freshness.mode !== "live" && !archivedDemo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.refresh()}
              >
                <RefreshCw aria-hidden="true" size={14} /> Retry live data
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
