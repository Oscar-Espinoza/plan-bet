"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { DemoStamp } from "@/components/demo-stamp";
import { LocalDateTime } from "@/components/local-date-time";
import { TeamMark } from "@/components/team-mark";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import type { GameDetailData, StatcastBatting, Team } from "@/lib/contracts";
import { isLegacyBaseballGameId } from "@/lib/game-ids";
import { useMatchdayStore } from "@/lib/store";

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
}: {
  data: GameDetailData;
  team: Team;
}) {
  const router = useRouter();
  const { snapshot, briefing } = data;
  const { game, context, evidenceFacts, sources, freshness } = snapshot;
  const [watchText, setWatchText] = useState("");
  const [message, setMessage] = useState("");
  const recapNote = useMatchdayStore((state) => state.recapNotes[game.id]);
  const viewed = useMatchdayStore((state) =>
    state.viewedBriefings.includes(game.id),
  );
  const saved = useMatchdayStore((state) =>
    state.savedBriefings.includes(game.id),
  );
  const addWatchlistItem = useMatchdayStore((state) => state.addWatchlistItem);
  const saveRecap = useMatchdayStore((state) => state.saveRecap);
  const viewBriefing = useMatchdayStore((state) => state.viewBriefing);
  const toggleSavedBriefing = useMatchdayStore(
    (state) => state.toggleSavedBriefing,
  );
  const isHome = game.homeTeamSlug === team.slug;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const archivedDemo =
    game.sport === "baseball" &&
    freshness.mode === "demo" &&
    isLegacyBaseballGameId(game.id);

  const submitWatch = (event: React.FormEvent) => {
    event.preventDefault();
    const id = addWatchlistItem({
      sport: game.sport,
      teamSlug: team.slug,
      gameId: game.id,
      gameLabel: `${team.shortName} ${isHome ? "vs" : "at"} ${opponent}`,
      text: watchText,
    });
    if (!id) return;
    setWatchText("");
    setMessage("Watchlist item added.");
  };

  const submitRecap = (event: React.FormEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const recap = String(form.get("recap") ?? "");
    if (saveRecap(game.id, recap, team.slug))
      setMessage("Recap saved locally.");
  };

  const openBrief = () => {
    viewBriefing(game.id, team.slug);
    setMessage("Evidence brief opened.");
  };

  return (
    <>
      <Link href="/" className="back-link">
        <ArrowLeft aria-hidden="true" size={15} /> Back to next five
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
            <span>vs</span>
            <LocalDateTime value={game.scheduledAt} />
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

      <div className="detail-layout">
        <div className="detail-primary">
          <section className="panel" aria-labelledby="context-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{context.kind} context</p>
                <h2 className="panel-title" id="context-heading">
                  Matchup read
                </h2>
              </div>
              <span className="fine-print">Sport-specific view</span>
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

          <section
            className="brief-panel panel"
            aria-labelledby="brief-heading"
          >
            <div className="brief-intro">
              <div>
                <p className="eyebrow">Prepared example</p>
                <h2 className="panel-title" id="brief-heading">
                  Game brief
                </h2>
                <p>{briefing.summary}</p>
              </div>
              {!viewed ? (
                <Button onClick={openBrief}>View demo brief</Button>
              ) : (
                <StatusTag tone="positive">
                  <CheckCircle2 aria-hidden="true" size={12} /> Viewed
                </StatusTag>
              )}
            </div>
            {viewed && (
              <div id="demo-brief" className="brief-content">
                <ol className="brief-list">
                  {briefing.items.map((item) => (
                    <li key={item.id}>
                      <span>{item.category}</span>
                      <p>{item.text}</p>
                      <small>
                        {item.evidenceIds.length} cited{" "}
                        {item.evidenceIds.length === 1 ? "fact" : "facts"}
                      </small>
                    </li>
                  ))}
                </ol>
                <div className="brief-actions">
                  <Button
                    variant="secondary"
                    onClick={() => toggleSavedBriefing(game.id, team.slug)}
                  >
                    {saved ? (
                      <BookmarkCheck aria-hidden="true" size={16} />
                    ) : (
                      <Bookmark aria-hidden="true" size={16} />
                    )}
                    {saved ? "Saved" : "Save brief"}
                  </Button>
                </div>
                <details className="evidence-disclosure">
                  <summary>
                    <span>
                      <ShieldCheck aria-hidden="true" size={17} /> Data used
                    </span>
                    <ChevronDown aria-hidden="true" size={17} />
                  </summary>
                  <div className="evidence-list">
                    {evidenceFacts.map((fact) => (
                      <div key={fact.id}>
                        <span>{fact.label}</span>
                        <strong>{fact.value}</strong>
                        <small>Ref: {fact.id}</small>
                      </div>
                    ))}
                  </div>
                </details>
                <div className="limitations">
                  <CircleAlert aria-hidden="true" size={17} />
                  <div>
                    <strong>Limitations</strong>
                    {briefing.limitations.map((limitation) => (
                      <p key={limitation}>{limitation}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Sources</h2>
              <StatusTag>
                {sources.length}{" "}
                {sources.length === 1 ? "reference" : "references"}
              </StatusTag>
            </div>
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
          </section>
        </div>

        <aside className="detail-side">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Watch this game</h2>
            </div>
            <form className="side-form" onSubmit={submitWatch}>
              <label htmlFor="game-watch-item" className="field-label">
                Preparation item
              </label>
              <textarea
                id="game-watch-item"
                className="textarea"
                value={watchText}
                onChange={(event) => setWatchText(event.target.value)}
                maxLength={500}
                placeholder="e.g. Confirm the starting lineup"
                required
              />
              <Button type="submit" className="w-full">
                <Plus aria-hidden="true" size={16} /> Add to watchlist
              </Button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Recap note</h2>
            </div>
            <form className="side-form" onSubmit={submitRecap}>
              <label htmlFor="game-recap" className="field-label">
                Your post-game note
              </label>
              <textarea
                id="game-recap"
                key={recapNote ?? "empty-recap"}
                name="recap"
                className="textarea recap-field"
                defaultValue={recapNote ?? ""}
                maxLength={2000}
                placeholder="Add a concise observation after the game…"
                required
              />
              <Button type="submit" variant="secondary" className="w-full">
                <Save aria-hidden="true" size={16} /> Save recap
              </Button>
              <p className="fine-print">Stored only in this browser.</p>
            </form>
          </section>
          <div className="side-disclaimer">
            <strong>Session 03 data boundary</strong>
            <p>
              Soccer and baseball use validated provider snapshots when
              available. Baseball Savant enrichment is optional, and the brief
              remains deterministic—live AI is not active yet.
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
        </aside>
      </div>
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </>
  );
}
