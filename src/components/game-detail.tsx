"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  Cpu,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { BetSlip, type WagerPanelData } from "@/components/bet-slip";
import { DemoStamp } from "@/components/demo-stamp";
import { LocalDateTime } from "@/components/local-date-time";
import { TeamMark } from "@/components/team-mark";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import type {
  Briefing,
  BriefingQuota,
  BriefingReason,
  GameDetailData,
  StatcastBatting,
  Team,
} from "@/lib/contracts";
import { briefingResultSchema } from "@/lib/contracts";
import { TIME_TOKEN } from "@/lib/briefing-prompt";
import { isLegacyBaseballGameId } from "@/lib/game-ids";
import { gradeSelection, marketsFor } from "@/lib/markets";
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

const GRADE_TONE = {
  won: { tone: "positive", label: "Won" },
  lost: { tone: "neutral", label: "Lost" },
  void: { tone: "warning", label: "Void" },
} as const;

/** Short, sighted-reader version of the reason the API returns. */
const REASON_LABELS: Record<BriefingReason, string> = {
  ai_unconfigured: "AI not configured",
  validation_failed: "Output failed validation",
  provider_timeout: "Model timed out",
  provider_unavailable: "Model unreachable",
  provider_rate_limited: "Model rate limited",
};

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
  aiEnabled = false,
  wagering,
}: {
  data: GameDetailData;
  team: Team;
  aiEnabled?: boolean;
  // Optional so game-detail.test.tsx keeps compiling without wiring it.
  // Absent entirely when sign-in isn't configured — matches AccountControl.
  wagering?: WagerPanelData;
}) {
  const router = useRouter();
  const { snapshot, briefing } = data;
  const { game, context, evidenceFacts, sources, freshness } = snapshot;
  const [watchText, setWatchText] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [quota, setQuota] = useState<BriefingQuota>();
  const [reason, setReason] = useState<BriefingReason>();
  const [failure, setFailure] = useState("");
  const inFlight = useRef(false);
  // The sr-only live region below is the single place any status message is
  // announced. Clearing it first (via a synchronous commit) before writing
  // the next message forces a fresh DOM mutation even when the new text is
  // identical to the last one, so a repeated message is still announced.
  const announce = (text: string) => {
    flushSync(() => setMessage(""));
    setMessage(text);
  };
  const recapNote = useMatchdayStore((state) => state.recapNotes[game.id]);
  const viewed = useMatchdayStore((state) =>
    state.viewedBriefings.includes(game.id),
  );
  const saved = useMatchdayStore((state) =>
    state.savedBriefings.includes(game.id),
  );
  const generated = useMatchdayStore(
    (state) => state.generatedBriefings[game.id],
  );
  const anonymousId = useMatchdayStore((state) => state.anonymousId);
  const hydrated = useMatchdayStore((state) => state.hydrated);
  const recapRef = useRef<HTMLTextAreaElement>(null);
  // Tracks which game's stored note the textarea last picked up. The field is
  // uncontrolled (no onChange) so typing never touches this component's
  // state; only hydration finishing or navigating to a different game should
  // overwrite the DOM value, never a re-render triggered by something else
  // (which is what remounting the element via a `key` used to do, wiping
  // whatever the reader had just typed).
  const recapSyncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || recapSyncedFor.current === game.id) return;
    recapSyncedFor.current = game.id;
    if (recapRef.current) recapRef.current.value = recapNote ?? "";
  }, [hydrated, game.id, recapNote]);
  // Selected as the stored reference and derived below: returning a fresh array
  // from the selector would re-render on every store read.
  const watchlistItems = useMatchdayStore((state) => state.watchlistItems);
  const saveGeneratedBriefing = useMatchdayStore(
    (state) => state.saveGeneratedBriefing,
  );
  const addWatchlistItem = useMatchdayStore((state) => state.addWatchlistItem);
  const saveRecap = useMatchdayStore((state) => state.saveRecap);
  const viewBriefing = useMatchdayStore((state) => state.viewBriefing);
  const toggleSavedBriefing = useMatchdayStore(
    (state) => state.toggleSavedBriefing,
  );
  // The generated briefing replaces the server one only once it has arrived, so
  // a pending or failed regeneration never blanks what the reader is looking at.
  const shown: Briefing = generated ?? briefing;
  const briefMode = shown.mode;
  // "Fallback" only means something once a generation was actually attempted.
  // Before that, the deterministic brief is simply the brief on offer.
  const briefLabel =
    briefMode === "ai"
      ? "Live AI"
      : briefMode === "demo"
        ? "Demo"
        : generated
          ? "Fallback"
          : "Evidence brief";
  const briefOpen = viewed || Boolean(generated);
  const openWatchlist = watchlistItems
    .filter((item) => item.gameId === game.id && item.status === "open")
    .map((item) => item.text);
  // Reference numbers key off the snapshot's own fact order, so a fact keeps the
  // same number whether or not this briefing happens to cite it.
  const citedRefs = (ids: string[]) =>
    evidenceFacts
      .map((fact, index) => (ids.includes(fact.id) ? index + 1 : 0))
      .filter(Boolean);
  const renderItemText = (item: Briefing["items"][number]) => {
    const [before, after] = item.text.split(TIME_TOKEN);
    if (!item.timestamp) return item.text;
    if (after === undefined) {
      return (
        <>
          {item.text} <LocalDateTime value={item.timestamp} />
        </>
      );
    }
    return (
      <>
        {before}
        <LocalDateTime value={item.timestamp} />
        {after}
      </>
    );
  };
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
    announce("Watchlist item added.");
  };

  const submitRecap = (event: React.FormEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const recap = String(form.get("recap") ?? "");
    if (saveRecap(game.id, recap, team.slug)) announce("Recap saved locally.");
  };

  const openBrief = () => {
    viewBriefing(game.id, team.slug);
    announce("Evidence brief opened.");
  };

  const generateBrief = async () => {
    // A ref, not state: it is set before React can re-render, so a double click
    // cannot slip a second request through.
    if (inFlight.current || !hydrated) return;
    inFlight.current = true;
    setPending(true);
    setFailure("");
    announce("Generating briefing…");
    try {
      const response = await fetch(`/api/games/${game.id}/briefings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: anonymousId,
          watchlist: openWatchlist
            .slice(0, 10)
            .map((text) => text.slice(0, 280)),
          note: recapNote,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const code =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof (payload as { error?: { code?: unknown } }).error?.code ===
            "string"
            ? (payload as { error: { code: string } }).error.code
            : "unavailable";
        const text =
          code === "quota_exceeded"
            ? "The daily briefing limit has been reached. The previous briefing is unchanged."
            : "Generation failed. The previous briefing is unchanged.";
        setFailure(text);
        announce(text);
        return;
      }
      const result = briefingResultSchema.parse(
        (payload as { data: unknown }).data,
      );
      saveGeneratedBriefing(game.id, team.slug, result.briefing);
      setQuota(result.quota);
      setReason(result.reason);
      announce(
        result.mode === "live"
          ? "Briefing generated."
          : "Generation unavailable. Showing the deterministic fallback briefing.",
      );
    } catch {
      const text = "Generation failed. The previous briefing is unchanged.";
      setFailure(text);
      announce(text);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <h1 className="sr-only">
        {game.result
          ? `${game.homeTeam} ${game.result.homeScore} – ${game.result.awayScore} ${game.awayTeam}, final`
          : `${game.homeTeam} vs ${game.awayTeam}`}
      </h1>
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
                <p className="eyebrow">
                  {aiEnabled ? "Grounded briefing" : "Prepared example"}
                </p>
                <h2 className="panel-title" id="brief-heading">
                  Game brief
                </h2>
                <p>{shown.summary}</p>
                <div className="brief-meta">
                  <StatusTag tone={briefMode === "ai" ? "positive" : "warning"}>
                    {briefLabel}
                  </StatusTag>
                  {briefMode === "fallback" && reason && (
                    <span className="brief-reason">
                      {REASON_LABELS[reason]}
                    </span>
                  )}
                  <span>
                    Model: <Provided value={shown.generation?.model} />
                  </span>
                  <span>
                    Generated <LocalDateTime value={shown.generatedAt} short />
                  </span>
                  {shown.generation && (
                    <span>{shown.generation.latencyMs} ms</span>
                  )}
                  <span>Data: {freshness.mode}</span>
                  {quota && (
                    <span>
                      {quota.remaining} generation
                      {quota.remaining === 1 ? "" : "s"} left today
                    </span>
                  )}
                </div>
              </div>
              {aiEnabled ? (
                <Button
                  onClick={generateBrief}
                  disabled={pending || !hydrated}
                  aria-busy={pending}
                >
                  <Cpu aria-hidden="true" size={16} />
                  {pending
                    ? "Generating…"
                    : generated
                      ? "Regenerate briefing"
                      : "Generate briefing"}
                </Button>
              ) : !viewed ? (
                <Button onClick={openBrief}>View demo brief</Button>
              ) : (
                <StatusTag tone="positive">
                  <CheckCircle2 aria-hidden="true" size={12} /> Viewed
                </StatusTag>
              )}
            </div>
            {failure && (
              <p className="brief-failure">
                <CircleAlert aria-hidden="true" size={15} /> {failure}
              </p>
            )}
            {briefOpen && (
              <div id="demo-brief" className="brief-content">
                <div className="brief-list">
                  {shown.items.map((item) => (
                    <p key={item.id}>
                      {renderItemText(item)}
                      {citedRefs(item.evidenceIds).map((reference) => (
                        <sup key={reference} className="brief-ref">
                          [{reference}]
                        </sup>
                      ))}
                    </p>
                  ))}
                </div>
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
                      <ShieldCheck aria-hidden="true" size={17} /> Data used ·{" "}
                      {evidenceFacts.length} facts · {sources.length} sources
                    </span>
                    <ChevronDown aria-hidden="true" size={17} />
                  </summary>
                  <div className="evidence-list">
                    {evidenceFacts.map((fact, index) => (
                      <div key={fact.id}>
                        <span>
                          <b className="brief-ref">[{index + 1}]</b>{" "}
                          {fact.label}
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
                <div className="limitations">
                  <CircleAlert aria-hidden="true" size={17} />
                  <div>
                    <strong>Limitations</strong>
                    {shown.limitations.map((limitation) => (
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

          <section className="panel" aria-labelledby="markets-heading">
            <div className="panel-header">
              <h2 className="panel-title" id="markets-heading">
                Markets
              </h2>
              <StatusTag>House prices</StatusTag>
            </div>
            <div className="panel-body">
              {marketsFor(game.sport).map((market) => (
                <div className="mt-4 first:mt-0" key={market.id}>
                  {/* Tailwind's preflight flattens a bare h3 to body text, and
                      `.field-label` is the house small-uppercase label. */}
                  <h3 className="field-label">{market.label}</h3>
                  {market.selections.map((selection) => {
                    // Only a finished game has a result to grade against; an
                    // upcoming or in-progress game shows prices with no outcome.
                    const grade = game.result
                      ? gradeSelection(market, selection.id, game)
                      : undefined;
                    return (
                      <div className="data-pair" key={selection.id}>
                        <span>{selection.label}</span>
                        <span className="inline-flex items-center gap-2">
                          {selection.price.toFixed(2)}
                          {grade && (
                            <StatusTag tone={GRADE_TONE[grade].tone}>
                              {GRADE_TONE[grade].label}
                            </StatusTag>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="detail-side" aria-label="Preparation tools">
          {wagering && <BetSlip data={wagering} />}
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
                ref={recapRef}
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
            <strong>How this brief is made</strong>
            <p>
              Every bullet is written from the validated provider snapshot above
              and must cite evidence from it.{" "}
              {aiEnabled
                ? "When generation fails validation or the model is unreachable, the deterministic evidence brief is served instead and labelled as a fallback."
                : "AI generation is not configured here, so the deterministic evidence brief is shown."}{" "}
              Market prices shown on this page are fictional house prices
              published by this app for a free-to-play simulator — not bookmaker
              odds, not a prediction, and not betting advice. No real money is
              involved and nothing is withdrawable; see the{" "}
              <Link href="/rules">rules</Link> for how markets settle.
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
