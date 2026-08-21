import type { Metadata } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Cpu,
  Database,
  RefreshCw,
  Repeat,
  Timer,
} from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { StatusTag } from "@/components/ui/status-tag";
import { getSystemMetrics } from "@/data/system-metrics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "System" };

function pct(numerator: number, denominator: number) {
  if (denominator <= 0) return "Not provided";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatMs(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Not provided"
    : `${Math.round(value)} ms`;
}

function formatCost(micros: number) {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function sportLabel(sport: string) {
  return sport === "soccer" ? "Soccer" : "Baseball";
}

function runTone(status: "running" | "succeeded" | "failed") {
  if (status === "succeeded") return "positive" as const;
  if (status === "failed") return "negative" as const;
  return "neutral" as const;
}

export default async function Page() {
  const metrics = await getSystemMetrics();

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Operational telemetry</p>
          <h1 className="display-title">System</h1>
          <p className="page-description">
            Provider freshness, ingestion runs, and AI briefing generation
            health for this deployment. Aggregates and timestamps only — no
            per-visitor detail is ever shown here.
          </p>
        </div>
      </header>

      {!metrics.available ? (
        <section className="panel" aria-labelledby="system-unavailable-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="system-unavailable-heading">
              Operational data unavailable
            </h2>
          </div>
          <div className="empty-state">
            <div>
              <span className="empty-icon">
                <AlertTriangle aria-hidden="true" />
              </span>
              <h3 className="empty-title">
                {metrics.reason === "unconfigured"
                  ? "Database is not configured"
                  : "Database is unreachable"}
              </h3>
              <p className="empty-copy">
                {metrics.reason === "unconfigured"
                  ? "This environment has no DATABASE_URL set, so there is no ingestion or briefing history to show."
                  : "The database could not be reached just now. This page will show data again once it recovers."}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="section-grid">
          <section className="panel" aria-labelledby="freshness-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Per sport</p>
                <h2 className="panel-title" id="freshness-heading">
                  Provider freshness
                </h2>
              </div>
              <span className="fine-print">
                Generated <LocalDateTime value={metrics.generatedAt} short />
              </span>
            </div>
            {metrics.freshness.length ? (
              metrics.freshness.map((row) => (
                <div className="stat-stack" key={row.sport}>
                  <div className="stat-row">
                    <span>{sportLabel(row.sport)} provider</span>
                    <strong>{row.provider}</strong>
                  </div>
                  <div className="stat-row">
                    <span>Freshness mode</span>
                    <strong>
                      <StatusTag
                        tone={row.mode === "live" ? "positive" : "warning"}
                      >
                        {row.mode}
                      </StatusTag>
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>Last fetch</span>
                    <strong>
                      {row.scheduleFetchedAt ? (
                        <LocalDateTime value={row.scheduleFetchedAt} short />
                      ) : (
                        "Not provided"
                      )}
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>Expires</span>
                    <strong>
                      {row.scheduleExpiresAt ? (
                        <LocalDateTime value={row.scheduleExpiresAt} short />
                      ) : (
                        "Not provided"
                      )}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="panel-body">
                <p className="fine-print">Not provided</p>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="ingestion-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Last {metrics.windowHours}h</p>
                <h2 className="panel-title" id="ingestion-heading">
                  Ingestion
                </h2>
              </div>
              <span className="fine-print">
                {metrics.ingestion.recent.length} recent run
                {metrics.ingestion.recent.length === 1 ? "" : "s"}
              </span>
            </div>
            {metrics.ingestion.byProvider.length ? (
              metrics.ingestion.byProvider.map((row) => (
                <div className="stat-stack" key={row.provider}>
                  <div className="stat-row">
                    <span>{row.provider}</span>
                    <strong>
                      {row.succeeded}/{row.total} succeeded
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>Failed</span>
                    <strong>{row.failed}</strong>
                  </div>
                  <div className="stat-row">
                    <span>Last run</span>
                    <strong>
                      {row.lastRunAt ? (
                        <LocalDateTime value={row.lastRunAt} short />
                      ) : (
                        "Not provided"
                      )}
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>Last success</span>
                    <strong>
                      {row.lastSuccessAt ? (
                        <LocalDateTime value={row.lastSuccessAt} short />
                      ) : (
                        "Not provided"
                      )}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="panel-body">
                <p className="fine-print">
                  No ingestion runs in the last {metrics.windowHours}h.
                </p>
              </div>
            )}
            <div className="panel-body">
              {metrics.ingestion.recent.length ? (
                <div className="source-list">
                  {metrics.ingestion.recent.map((run, index) => (
                    <div key={`${run.provider}-${run.startedAt}-${index}`}>
                      <span className="source-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>
                          {run.provider} · {run.operation}
                        </strong>
                        <p>
                          <StatusTag tone={runTone(run.status)}>
                            {run.status}
                          </StatusTag>{" "}
                          {run.scope} ·{" "}
                          {run.durationMs !== null
                            ? `${run.durationMs} ms`
                            : "Not provided"}
                          {run.errorCode ? ` · ${run.errorCode}` : ""}
                        </p>
                      </div>
                      <LocalDateTime value={run.startedAt} short />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="fine-print">No ingestion runs recorded yet.</p>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="briefings-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Last {metrics.windowHours}h</p>
                <h2 className="panel-title" id="briefings-heading">
                  AI briefings
                </h2>
              </div>
              <span className="fine-print">
                {metrics.briefings.lastGenerationAt ? (
                  <>
                    Last generation{" "}
                    <LocalDateTime
                      value={metrics.briefings.lastGenerationAt}
                      short
                    />
                  </>
                ) : (
                  "No generations yet"
                )}
              </span>
            </div>
            <div className="panel-body">
              <div className="metric-grid">
                <div className="metric-card panel">
                  <Cpu aria-hidden="true" size={17} />
                  <strong>{metrics.briefings.total}</strong>
                  <span>Generations</span>
                </div>
                <div className="metric-card panel">
                  <RefreshCw aria-hidden="true" size={17} />
                  <strong>
                    {pct(metrics.briefings.fallback, metrics.briefings.total)}
                  </strong>
                  <span>Fallback rate</span>
                </div>
                <div className="metric-card panel">
                  <CheckCircle2 aria-hidden="true" size={17} />
                  <strong>
                    {pct(metrics.briefings.succeeded, metrics.briefings.total)}
                  </strong>
                  <span>Validated rate</span>
                </div>
                <div className="metric-card panel">
                  <Repeat aria-hidden="true" size={17} />
                  <strong>
                    {pct(metrics.briefings.retried, metrics.briefings.total)}
                  </strong>
                  <span>Retry rate</span>
                </div>
                <div className="metric-card panel">
                  <Timer aria-hidden="true" size={17} />
                  <strong>
                    {metrics.briefings.latencyMs
                      ? formatMs(metrics.briefings.latencyMs.p50)
                      : "Not provided"}
                  </strong>
                  <span>Latency p50</span>
                </div>
                <div className="metric-card panel">
                  <Timer aria-hidden="true" size={17} />
                  <strong>
                    {metrics.briefings.latencyMs
                      ? formatMs(metrics.briefings.latencyMs.p95)
                      : "Not provided"}
                  </strong>
                  <span>Latency p95</span>
                </div>
                <div className="metric-card panel">
                  <Database aria-hidden="true" size={17} />
                  <strong>
                    {metrics.briefings.inputTokens} /{" "}
                    {metrics.briefings.outputTokens}
                  </strong>
                  <span>Tokens in / out</span>
                </div>
                <div className="metric-card panel">
                  <Coins aria-hidden="true" size={17} />
                  <strong>
                    {formatCost(metrics.briefings.estimatedCostMicros)}
                  </strong>
                  <span>Est. cost</span>
                </div>
              </div>
              <p className="eyebrow">Recent error codes</p>
              {metrics.briefings.errors.length ? (
                <div className="tag-row">
                  {metrics.briefings.errors.map((error) => (
                    <StatusTag tone="negative" key={error.code}>
                      {error.code} · {error.count}
                    </StatusTag>
                  ))}
                </div>
              ) : (
                <p className="fine-print">No errors recorded in this window.</p>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="settlement-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Last {metrics.windowHours}h</p>
                <h2 className="panel-title" id="settlement-heading">
                  Settlement
                </h2>
              </div>
              <span className="fine-print">
                {metrics.settlement.status ? (
                  <StatusTag tone={runTone(metrics.settlement.status)}>
                    {metrics.settlement.status}
                  </StatusTag>
                ) : (
                  "No runs yet"
                )}
              </span>
            </div>
            <div className="stat-stack">
              <div className="stat-row">
                <span>Last run</span>
                <strong>
                  {metrics.settlement.lastRunAt ? (
                    <LocalDateTime value={metrics.settlement.lastRunAt} short />
                  ) : (
                    "Not provided"
                  )}
                </strong>
              </div>
              <div className="stat-row">
                <span>Last success</span>
                <strong>
                  {metrics.settlement.lastSuccessAt ? (
                    <LocalDateTime
                      value={metrics.settlement.lastSuccessAt}
                      short
                    />
                  ) : (
                    "Not provided"
                  )}
                </strong>
              </div>
              <div className="stat-row">
                <span>Oldest open wager</span>
                <strong>
                  {metrics.settlement.oldestOpenWagerAt ? (
                    <LocalDateTime
                      value={metrics.settlement.oldestOpenWagerAt}
                      short
                    />
                  ) : (
                    "None open"
                  )}
                </strong>
              </div>
            </div>
            <div className="panel-body">
              <div className="metric-grid">
                <div className="metric-card panel">
                  <CheckCircle2 aria-hidden="true" size={17} />
                  <strong>{metrics.settlement.byOutcome.won}</strong>
                  <span>Won</span>
                </div>
                <div className="metric-card panel">
                  <AlertTriangle aria-hidden="true" size={17} />
                  <strong>{metrics.settlement.byOutcome.lost}</strong>
                  <span>Lost</span>
                </div>
                <div className="metric-card panel">
                  <Repeat aria-hidden="true" size={17} />
                  <strong>{metrics.settlement.byOutcome.void}</strong>
                  <span>Void</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
