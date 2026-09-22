import { getTranslation } from "@/lib/locale-server";
import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Repeat } from "lucide-react";
import { LocalDateTime } from "@/components/local-date-time";
import { StatusTag } from "@/components/ui/status-tag";
import { getSystemMetrics } from "@/data/system-metrics";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return { title: t("System") };
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
  const { t } = await getTranslation();
  const metrics = await getSystemMetrics();

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("Operational telemetry")}</p>
          <h1 className="display-title">{t("System")}</h1>
          <p className="page-description">
            {t(
              "Provider freshness, ingestion runs, and settlement health for this deployment. Aggregates and timestamps only — no per-visitor detail is ever shown here.",
            )}{" "}
          </p>
        </div>
      </header>

      {!metrics.available ? (
        <section className="panel" aria-labelledby="system-unavailable-heading">
          <div className="panel-header">
            <h2 className="panel-title" id="system-unavailable-heading">
              {t("Operational data unavailable")}{" "}
            </h2>
          </div>
          <div className="empty-state">
            <div>
              <span className="empty-icon">
                <AlertTriangle aria-hidden="true" />
              </span>
              <h3 className="empty-title">
                {metrics.reason === "unconfigured"
                  ? t("Database is not configured")
                  : t("Database is unreachable")}
              </h3>
              <p className="empty-copy">
                {metrics.reason === "unconfigured"
                  ? t(
                      "This environment has no DATABASE_URL set, so there is no ingestion or settlement history to show.",
                    )
                  : t(
                      "The database could not be reached just now. This page will show data again once it recovers.",
                    )}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="section-grid">
          <section className="panel" aria-labelledby="freshness-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{t("Per sport")}</p>
                <h2 className="panel-title" id="freshness-heading">
                  {t("Provider freshness")}{" "}
                </h2>
              </div>
              <span className="fine-print">
                {t("Generated")}{" "}
                <LocalDateTime value={metrics.generatedAt} short />
              </span>
            </div>
            {metrics.freshness.length ? (
              metrics.freshness.map((row) => (
                <div className="stat-stack" key={row.sport}>
                  <div className="stat-row">
                    <span>
                      {t("{p0} provider", { p0: t(sportLabel(row.sport)) })}
                    </span>
                    <strong>{row.provider}</strong>
                  </div>
                  <div className="stat-row">
                    <span>{t("Freshness mode")}</span>
                    <strong>
                      <StatusTag
                        tone={row.mode === "live" ? "positive" : "warning"}
                      >
                        {t(row.mode)}
                      </StatusTag>
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>{t("Last fetch")}</span>
                    <strong>
                      {row.scheduleFetchedAt ? (
                        <LocalDateTime value={row.scheduleFetchedAt} short />
                      ) : (
                        t("Not provided")
                      )}
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>{t("Expires")}</span>
                    <strong>
                      {row.scheduleExpiresAt ? (
                        <LocalDateTime value={row.scheduleExpiresAt} short />
                      ) : (
                        t("Not provided")
                      )}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="panel-body">
                <p className="fine-print">{t("Not provided")}</p>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="ingestion-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">
                  {t("Last")} {metrics.windowHours}h
                </p>
                <h2 className="panel-title" id="ingestion-heading">
                  {t("Ingestion")}{" "}
                </h2>
              </div>
              <span className="fine-print">
                {t(
                  metrics.ingestion.recent.length === 1
                    ? "{p0} recent run"
                    : "{p0} recent runs",
                  { p0: metrics.ingestion.recent.length },
                )}
              </span>
            </div>
            {metrics.ingestion.byProvider.length ? (
              metrics.ingestion.byProvider.map((row) => (
                <div className="stat-stack" key={row.provider}>
                  <div className="stat-row">
                    <span>{row.provider}</span>
                    <strong>
                      {t("{p0}/{p1} succeeded", {
                        p0: row.succeeded,
                        p1: row.total,
                      })}
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>{t("Failed")}</span>
                    <strong>{row.failed}</strong>
                  </div>
                  <div className="stat-row">
                    <span>{t("Last run")}</span>
                    <strong>
                      {row.lastRunAt ? (
                        <LocalDateTime value={row.lastRunAt} short />
                      ) : (
                        t("Not provided")
                      )}
                    </strong>
                  </div>
                  <div className="stat-row">
                    <span>{t("Last success")}</span>
                    <strong>
                      {row.lastSuccessAt ? (
                        <LocalDateTime value={row.lastSuccessAt} short />
                      ) : (
                        t("Not provided")
                      )}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="panel-body">
                <p className="fine-print">
                  {t("No ingestion runs in the last")} {metrics.windowHours}h.
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
                          {run.provider} · {t(run.operation)}
                        </strong>
                        <p>
                          <StatusTag tone={runTone(run.status)}>
                            {t(run.status)}
                          </StatusTag>{" "}
                          {t(run.scope)} ·{" "}
                          {run.durationMs !== null
                            ? t("{p0} ms", { p0: run.durationMs })
                            : t("Not provided")}
                          {run.errorCode ? ` · ${run.errorCode}` : ""}
                        </p>
                      </div>
                      <LocalDateTime value={run.startedAt} short />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="fine-print">
                  {t("No ingestion runs recorded yet.")}
                </p>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="settlement-heading">
            <div className="panel-header">
              <div>
                <p className="eyebrow">
                  {t("Last")} {metrics.windowHours}h
                </p>
                <h2 className="panel-title" id="settlement-heading">
                  {t("Settlement")}{" "}
                </h2>
              </div>
              <span className="fine-print">
                {metrics.settlement.status ? (
                  <StatusTag tone={runTone(metrics.settlement.status)}>
                    {t(metrics.settlement.status)}
                  </StatusTag>
                ) : (
                  t("No runs yet")
                )}
              </span>
            </div>
            <div className="stat-stack">
              <div className="stat-row">
                <span>{t("Last run")}</span>
                <strong>
                  {metrics.settlement.lastRunAt ? (
                    <LocalDateTime value={metrics.settlement.lastRunAt} short />
                  ) : (
                    t("Not provided")
                  )}
                </strong>
              </div>
              <div className="stat-row">
                <span>{t("Last success")}</span>
                <strong>
                  {metrics.settlement.lastSuccessAt ? (
                    <LocalDateTime
                      value={metrics.settlement.lastSuccessAt}
                      short
                    />
                  ) : (
                    t("Not provided")
                  )}
                </strong>
              </div>
              <div className="stat-row">
                <span>{t("Oldest open wager")}</span>
                <strong>
                  {metrics.settlement.oldestOpenWagerAt ? (
                    <LocalDateTime
                      value={metrics.settlement.oldestOpenWagerAt}
                      short
                    />
                  ) : (
                    t("None open")
                  )}
                </strong>
              </div>
            </div>
            <div className="panel-body">
              <div className="metric-grid">
                <div className="metric-card panel">
                  <CheckCircle2 aria-hidden="true" size={17} />
                  <strong>{metrics.settlement.byOutcome.won}</strong>
                  <span>{t("Won")}</span>
                </div>
                <div className="metric-card panel">
                  <AlertTriangle aria-hidden="true" size={17} />
                  <strong>{metrics.settlement.byOutcome.lost}</strong>
                  <span>{t("Lost")}</span>
                </div>
                <div className="metric-card panel">
                  <Repeat aria-hidden="true" size={17} />
                  <strong>{metrics.settlement.byOutcome.void}</strong>
                  <span>{t("Void")}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
