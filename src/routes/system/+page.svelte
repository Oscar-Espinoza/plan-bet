<script lang="ts">
  import Breadcrumb from "#lib/components/breadcrumb.svelte";
  import LocalDateTime from "#lib/components/local-date-time.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import StatusTag from "#lib/components/ui/status-tag.svelte";
  import { AlertTriangle, CheckCircle2, Repeat } from "@lucide/svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const i18n = useTranslation();

  function sportLabel(sport: string) {
    return sport === "soccer" ? "Soccer" : "Baseball";
  }

  function runTone(status: "running" | "succeeded" | "failed") {
    if (status === "succeeded") return "positive" as const;
    if (status === "failed") return "negative" as const;
    return "neutral" as const;
  }
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

{#await data.metrics then metrics}
  <header class="page-heading">
    <Breadcrumb items={[{ label: i18n.t("System") }]} />
    <div>
      <p class="eyebrow">{i18n.t("Operational telemetry")}</p>
      <h1 class="display-title">{i18n.t("System")}</h1>
      <p class="page-description">
        {i18n.t(
          "Provider freshness, ingestion runs, and settlement health for this deployment. Aggregates and timestamps only — no per-visitor detail is ever shown here.",
        )}
      </p>
    </div>
  </header>

  {#if !metrics.available}
    <section class="panel" aria-labelledby="system-unavailable-heading">
      <div class="panel-header">
        <h2 class="panel-title" id="system-unavailable-heading">
          {i18n.t("Operational data unavailable")}
        </h2>
      </div>
      <div class="empty-state">
        <div>
          <span class="empty-icon">
            <AlertTriangle aria-hidden="true" />
          </span>
          <h3 class="empty-title">
            {metrics.reason === "unconfigured"
              ? i18n.t("Database is not configured")
              : i18n.t("Database is unreachable")}
          </h3>
          <p class="empty-copy">
            {metrics.reason === "unconfigured"
              ? i18n.t(
                  "This environment has no DATABASE_URL set, so there is no ingestion or settlement history to show.",
                )
              : i18n.t(
                  "The database could not be reached just now. This page will show data again once it recovers.",
                )}
          </p>
        </div>
      </div>
    </section>
  {:else}
    <div class="section-grid">
      <section class="panel" aria-labelledby="freshness-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">{i18n.t("Per sport")}</p>
            <h2 class="panel-title" id="freshness-heading">
              {i18n.t("Provider freshness")}
            </h2>
          </div>
          <span class="fine-print">
            {i18n.t("Generated")}
            <LocalDateTime value={metrics.generatedAt} short />
          </span>
        </div>
        {#if metrics.freshness.length}
          {#each metrics.freshness as row (row.sport)}
            <div class="stat-stack">
              <div class="stat-row">
                <span>
                  {i18n.t("{p0} provider", {
                    p0: i18n.t(sportLabel(row.sport)),
                  })}
                </span>
                <strong>{row.provider}</strong>
              </div>
              <div class="stat-row">
                <span>{i18n.t("Freshness mode")}</span>
                <strong>
                  <StatusTag
                    tone={row.mode === "live" ? "positive" : "warning"}
                  >
                    {i18n.t(row.mode)}
                  </StatusTag>
                </strong>
              </div>
              <div class="stat-row">
                <span>{i18n.t("Last fetch")}</span>
                <strong>
                  {#if row.scheduleFetchedAt}
                    <LocalDateTime value={row.scheduleFetchedAt} short />
                  {:else}
                    {i18n.t("Not provided")}
                  {/if}
                </strong>
              </div>
              <div class="stat-row">
                <span>{i18n.t("Expires")}</span>
                <strong>
                  {#if row.scheduleExpiresAt}
                    <LocalDateTime value={row.scheduleExpiresAt} short />
                  {:else}
                    {i18n.t("Not provided")}
                  {/if}
                </strong>
              </div>
            </div>
          {/each}
        {:else}
          <div class="panel-body">
            <p class="fine-print">{i18n.t("Not provided")}</p>
          </div>
        {/if}
      </section>

      <section class="panel" aria-labelledby="ingestion-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">
              {i18n.t("Last")}
              {metrics.windowHours}h
            </p>
            <h2 class="panel-title" id="ingestion-heading">
              {i18n.t("Ingestion")}
            </h2>
          </div>
          <span class="fine-print">
            {i18n.t(
              metrics.ingestion.recent.length === 1
                ? "{p0} recent run"
                : "{p0} recent runs",
              { p0: metrics.ingestion.recent.length },
            )}
          </span>
        </div>
        {#if metrics.ingestion.byProvider.length}
          {#each metrics.ingestion.byProvider as row (row.provider)}
            <div class="stat-stack">
              <div class="stat-row">
                <span>{row.provider}</span>
                <strong>
                  {i18n.t("{p0}/{p1} succeeded", {
                    p0: row.succeeded,
                    p1: row.total,
                  })}
                </strong>
              </div>
              <div class="stat-row">
                <span>{i18n.t("Failed")}</span>
                <strong>{row.failed}</strong>
              </div>
              <div class="stat-row">
                <span>{i18n.t("Last run")}</span>
                <strong>
                  {#if row.lastRunAt}
                    <LocalDateTime value={row.lastRunAt} short />
                  {:else}
                    {i18n.t("Not provided")}
                  {/if}
                </strong>
              </div>
              <div class="stat-row">
                <span>{i18n.t("Last success")}</span>
                <strong>
                  {#if row.lastSuccessAt}
                    <LocalDateTime value={row.lastSuccessAt} short />
                  {:else}
                    {i18n.t("Not provided")}
                  {/if}
                </strong>
              </div>
            </div>
          {/each}
        {:else}
          <div class="panel-body">
            <p class="fine-print">
              {i18n.t("No ingestion runs in the last")}
              {metrics.windowHours}h.
            </p>
          </div>
        {/if}
        <div class="panel-body">
          {#if metrics.ingestion.recent.length}
            <div class="source-list">
              {#each metrics.ingestion.recent as run, index (run.provider + run.startedAt + index)}
                <div>
                  <span class="source-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>
                      {run.provider} · {i18n.t(run.operation)}
                    </strong>
                    <p>
                      <StatusTag tone={runTone(run.status)}>
                        {i18n.t(run.status)}
                      </StatusTag>
                      {i18n.t(run.scope)} ·
                      {#if run.durationMs !== null}
                        {i18n.t("{p0} ms", { p0: run.durationMs })}
                      {:else}
                        {i18n.t("Not provided")}
                      {/if}
                      {#if run.errorCode}
                        · {run.errorCode}
                      {/if}
                    </p>
                  </div>
                  <LocalDateTime value={run.startedAt} short />
                </div>
              {/each}
            </div>
          {:else}
            <p class="fine-print">
              {i18n.t("No ingestion runs recorded yet.")}
            </p>
          {/if}
        </div>
      </section>

      <section class="panel" aria-labelledby="settlement-heading">
        <div class="panel-header">
          <div>
            <p class="eyebrow">
              {i18n.t("Last")}
              {metrics.windowHours}h
            </p>
            <h2 class="panel-title" id="settlement-heading">
              {i18n.t("Settlement")}
            </h2>
          </div>
          <span class="fine-print">
            {#if metrics.settlement.status}
              <StatusTag tone={runTone(metrics.settlement.status)}>
                {i18n.t(metrics.settlement.status)}
              </StatusTag>
            {:else}
              {i18n.t("No runs yet")}
            {/if}
          </span>
        </div>
        <div class="stat-stack">
          <div class="stat-row">
            <span>{i18n.t("Last run")}</span>
            <strong>
              {#if metrics.settlement.lastRunAt}
                <LocalDateTime value={metrics.settlement.lastRunAt} short />
              {:else}
                {i18n.t("Not provided")}
              {/if}
            </strong>
          </div>
          <div class="stat-row">
            <span>{i18n.t("Last success")}</span>
            <strong>
              {#if metrics.settlement.lastSuccessAt}
                <LocalDateTime value={metrics.settlement.lastSuccessAt} short />
              {:else}
                {i18n.t("Not provided")}
              {/if}
            </strong>
          </div>
          <div class="stat-row">
            <span>{i18n.t("Oldest open wager")}</span>
            <strong>
              {#if metrics.settlement.oldestOpenWagerAt}
                <LocalDateTime
                  value={metrics.settlement.oldestOpenWagerAt}
                  short
                />
              {:else}
                {i18n.t("None open")}
              {/if}
            </strong>
          </div>
        </div>
        <div class="panel-body">
          <div class="metric-grid">
            <div class="metric-card panel">
              <CheckCircle2 aria-hidden="true" size={17} />
              <strong>{metrics.settlement.byOutcome.won}</strong>
              <span>{i18n.t("Won")}</span>
            </div>
            <div class="metric-card panel">
              <AlertTriangle aria-hidden="true" size={17} />
              <strong>{metrics.settlement.byOutcome.lost}</strong>
              <span>{i18n.t("Lost")}</span>
            </div>
            <div class="metric-card panel">
              <Repeat aria-hidden="true" size={17} />
              <strong>{metrics.settlement.byOutcome.void}</strong>
              <span>{i18n.t("Void")}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  {/if}
{/await}
