<script lang="ts">
  import { navigating } from "$app/state";
  import { tick } from "svelte";
  import { SvelteURLSearchParams } from "svelte/reactivity";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import BetsHistory from "#lib/components/bets-history.svelte";
  import Breadcrumb from "#lib/components/breadcrumb.svelte";
  import NavigationLink from "#lib/components/fast-link/navigation-link.svelte";
  import LanguageSwitch from "#lib/components/language-switch.svelte";
  import { useTranslation } from "#lib/components/language.svelte";
  import { arrive } from "#lib/components/motion";
  import ResetBankroll from "#lib/components/reset-bankroll.svelte";
  import SectionTabs from "#lib/components/section-tabs.svelte";
  import Button from "#lib/components/ui/button.svelte";
  import Card from "#lib/components/ui/card.svelte";
  import StatusTag from "#lib/components/ui/status-tag.svelte";
  import type { HistoryView, OpenWagersView } from "#lib/shared/wager-view";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const i18n = useTranslation();

  const openMountedAt = performance.now();
  const settledMountedAt = performance.now();
  const historyMountedAt = performance.now();
  let openShown = $state<OpenWagersView | undefined>();
  let settledShown = $state<HistoryView | undefined>();
  let historyShown = $state<HistoryView | undefined>();
  let openArrived = $state(false);
  let settledArrived = $state(false);
  let historyArrived = $state(false);
  let openRoot = $state<HTMLElement | null>(null);
  let settledRoot = $state<HTMLElement | null>(null);
  let historyRoot = $state<HTMLElement | null>(null);
  let reloading = $state(false);

  $effect(() => {
    if (navigating.to?.url.pathname === "/you") reloading = true;
  });

  $effect(() => {
    if (data.status !== "ready") return;
    const request = data.open;
    let active = true;
    void request.then((value) => {
      if (!active) return;
      const first = openShown === undefined;
      openShown = value;
      if (first && !openArrived) {
        openArrived = true;
        void tick().then(() => arrive(openRoot, openMountedAt, 0.6));
      }
    });
    return () => {
      active = false;
    };
  });

  $effect(() => {
    if (data.status !== "ready") return;
    const request = data.settled;
    let active = true;
    void request.then((value) => {
      if (!active) return;
      const first = settledShown === undefined;
      settledShown = value;
      if (first && !settledArrived) {
        settledArrived = true;
        void tick().then(() => arrive(settledRoot, settledMountedAt, 0.6));
      }
    });
    return () => {
      active = false;
    };
  });

  $effect(() => {
    if (data.status !== "ready") return;
    const request = data.history;
    void request.finally(() => {
      reloading = false;
    });
    let active = true;
    void request.then((value) => {
      if (!active) return;
      const first = historyShown === undefined;
      historyShown = value;
      if (first && !historyArrived) {
        historyArrived = true;
        void tick().then(() => arrive(historyRoot, historyMountedAt, 0.6));
      }
    });
    return () => {
      active = false;
    };
  });

  function hitRateLabel(won: number, lost: number) {
    const decided = won + lost;
    return decided > 0
      ? `${Math.round((won / decided) * 100)}%`
      : "Not provided";
  }

  function historyHref(target: number) {
    if (data.status !== "ready") return "/you";
    const params = new SvelteURLSearchParams({ tab: "bets" });
    if (data.filters.sport !== "all") params.set("sport", data.filters.sport);
    if (data.filters.outcome !== "all")
      params.set("outcome", data.filters.outcome);
    if (data.filters.range !== "all") params.set("range", data.filters.range);
    if (data.filters.scope !== "all") params.set("scope", data.filters.scope);
    if (target > 1) params.set("page", String(target));
    return `/you?${params.toString()}`;
  }

  const selects = $derived(
    data.status === "ready"
      ? [
          {
            id: "you-sport",
            name: "sport",
            label: "Sport",
            value: data.filters.sport,
            options: [
              ["all", "All sports"],
              ["soccer", "Soccer"],
              ["baseball", "Baseball"],
            ],
          },
          {
            id: "you-outcome",
            name: "outcome",
            label: "Outcome",
            value: data.filters.outcome,
            options: [
              ["all", "All outcomes"],
              ["open", "Open"],
              ["won", "Won"],
              ["lost", "Lost"],
              ["void", "Void"],
            ],
          },
          {
            id: "you-range",
            name: "range",
            label: "Time range",
            value: data.filters.range,
            options: [
              ["all", "All time"],
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
              ["90d", "Last 90 days"],
            ],
          },
          {
            id: "you-scope",
            name: "scope",
            label: "Placed with",
            value: data.filters.scope,
            options: [
              ["all", "Solo and group"],
              ["solo", "Solo only"],
              ["group", "Group only"],
            ],
          },
        ]
      : [],
  );
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

{#if data.status === "unconfigured"}
  <header class="page-heading">
    <Breadcrumb items={[{ label: i18n.t("You") }]} />
    <div>
      <p class="eyebrow">{i18n.t("Free-to-play record")}</p>
      <h1 class="display-title">{i18n.t("Where you stand")}</h1>
      <p class="page-description">
        {i18n.t(
          "Balance, record, open wagers, and history — one surface for where you stand.",
        )}
      </p>
    </div>
  </header>
  <section class="panel" aria-labelledby="you-unavailable-heading">
    <div class="panel-header">
      <h2 class="panel-title" id="you-unavailable-heading">
        {i18n.t("Sign-in unavailable")}
      </h2>
    </div>
    <div class="empty-state">
      <div>
        <span class="empty-icon">
          <AlertTriangle aria-hidden="true" />
        </span>
        <h3 class="empty-title">{i18n.t("Sign-in is not configured")}</h3>
        <p class="empty-copy">
          {i18n.t(
            "This environment has no auth provider configured, so there is no wager record to show.",
          )}
        </p>
      </div>
    </div>
  </section>
{:else}
  <header class="page-heading">
    <Breadcrumb items={[{ label: i18n.t("You") }]} />
    <div>
      <p class="eyebrow">
        {data.name ?? data.email ?? i18n.t("Free-to-play record")}
      </p>
      <h1 class="display-title">{i18n.t("Where you stand")}</h1>
      {#await data.summary}
        <div
          class="standing-lead standing-lead-loading"
          role="status"
          aria-label={i18n.t("Loading…")}
        ></div>
      {:then summary}
        <div class="standing-lead">
          <div>
            <p class="eyebrow">{i18n.t("Balance")}</p>
            <p class="standing-figure">
              {i18n.formatNumber(summary.balance)}
              <small>{i18n.t("credits")}</small>
            </p>
          </div>
          <div>
            <p class="eyebrow">{i18n.t("Record")}</p>
            <p class="standing-figure standing-figure-minor">
              {summary.won}{i18n.t("W")}
              {summary.lost}{i18n.t("L")}
              {summary.voided}{i18n.t("V")}
            </p>
          </div>
          <div>
            <p class="eyebrow">{i18n.t("Accuracy")}</p>
            <p class="standing-figure standing-figure-minor">
              {i18n.t(hitRateLabel(summary.won, summary.lost))}
            </p>
          </div>
          <div>
            <p class="eyebrow">{i18n.t("Net")}</p>
            <p
              class="standing-figure standing-figure-minor"
              data-tone={summary.net > 0
                ? "up"
                : summary.net < 0
                  ? "down"
                  : undefined}
            >
              {summary.net > 0 ? "+" : ""}{i18n.formatNumber(summary.net)}
            </p>
          </div>
        </div>
      {/await}
      <p class="page-description">
        {i18n.t("Fictional credits, house prices, never real money.")}
      </p>
    </div>
  </header>

  <SectionTabs
    label="Account sections"
    initial={data.tab}
    panels={[
      { key: "overview", label: "Overview", content: overviewPanel },
      { key: "bets", label: "Wagers", content: betsPanel },
      { key: "settings", label: "Settings", content: settingsPanel },
    ]}
  />
{/if}

{#snippet overviewPanel()}
  {#if data.status === "ready"}
    <div class="section-grid">
      {#if openShown}
        {@const open = openShown}
        <div bind:this={openRoot}>
          <Card titleId="open-wagers-heading">
            {#snippet title()}{i18n.t("Open wagers")}{/snippet}
            {#snippet headerExtra()}
              {#if open.count > 5}
                <NavigationLink
                  class="card-link"
                  href="/you?tab=bets&outcome=open"
                >
                  {i18n.t("See all")} ({open.count})
                  <ChevronRight aria-hidden="true" size={16} />
                </NavigationLink>
              {:else}
                <StatusTag>{open.count} {i18n.t("open")}</StatusTag>
              {/if}
            {/snippet}
            <BetsHistory
              compact
              items={open.items}
              emptyState={{
                title: "No open wagers",
                copy: "Place a free-to-play wager from a game page to see it here.",
              }}
            />
          </Card>
        </div>
      {:else}
        <div
          class="panel loading-panel"
          role="status"
          aria-label={i18n.t("Loading…")}
        ></div>
      {/if}

      {#if settledShown}
        {@const settled = settledShown}
        <div bind:this={settledRoot}>
          <Card titleId="just-settled-heading">
            {#snippet title()}{i18n.t("Just settled")}{/snippet}
            {#snippet headerExtra()}
              <NavigationLink class="card-link" href="/you?tab=bets">
                {i18n.t("History")}
                <ChevronRight aria-hidden="true" size={16} />
              </NavigationLink>
            {/snippet}
            <BetsHistory
              compact
              items={settled.items}
              emptyState={{
                title: "Nothing settled yet",
                copy: "Settled wagers land here once a game finishes.",
              }}
            />
          </Card>
        </div>
      {:else}
        <div
          class="panel loading-panel"
          role="status"
          aria-label={i18n.t("Loading…")}
        ></div>
      {/if}

      {#await data.slices}
        <div
          class="panel loading-panel"
          role="status"
          aria-label={i18n.t("Loading…")}
        ></div>
      {:then slices}
        <Card titleId="slices-heading">
          {#snippet title()}{i18n.t("Slices")}{/snippet}
          {#if slices.bySport.length || slices.byMarket.length}
            <table class="slice-table">
              <thead>
                <tr>
                  <th scope="col" class="sr-only">{i18n.t("Slice")}</th>
                  <th scope="col">{i18n.t("W")}</th>
                  <th scope="col">{i18n.t("L")}</th>
                  <th scope="col">{i18n.t("V")}</th>
                  <th scope="col" aria-label={i18n.t("Hit rate")}>%</th>
                </tr>
              </thead>
              {#if slices.bySport.length > 0}
                <tbody>
                  <tr class="slice-group">
                    <th scope="rowgroup" colspan="5">{i18n.t("By sport")}</th>
                  </tr>
                  {#each slices.bySport as slice (slice.key)}
                    <tr>
                      <th scope="row">{i18n.t(slice.label)}</th>
                      <td>{slice.won}</td>
                      <td>{slice.lost}</td>
                      <td>{slice.voided}</td>
                      <td>{i18n.t(hitRateLabel(slice.won, slice.lost))}</td>
                    </tr>
                  {/each}
                </tbody>
              {/if}
              {#if slices.byMarket.length > 0}
                <tbody>
                  <tr class="slice-group">
                    <th scope="rowgroup" colspan="5">{i18n.t("By market")}</th>
                  </tr>
                  {#each slices.byMarket as slice (slice.key)}
                    <tr>
                      <th scope="row">{i18n.t(slice.label)}</th>
                      <td>{slice.won}</td>
                      <td>{slice.lost}</td>
                      <td>{slice.voided}</td>
                      <td>{i18n.t(hitRateLabel(slice.won, slice.lost))}</td>
                    </tr>
                  {/each}
                </tbody>
              {/if}
            </table>
          {:else}
            <div class="panel-body">
              <p class="not-provided">
                {i18n.t("No settled wagers yet.")}
                <NavigationLink href="/"
                  >{i18n.t("Browse the board")}</NavigationLink
                >.
              </p>
            </div>
          {/if}
        </Card>
      {/await}
    </div>
  {/if}
{/snippet}

{#snippet betsPanel()}
  {#if data.status === "ready"}
    <section class="panel" aria-labelledby="you-history-heading">
      <div class="panel-header">
        <h2 class="panel-title" id="you-history-heading">
          {i18n.t("History")}
        </h2>
        <span class="fine-print">{i18n.t("Page")} {data.page}</span>
      </div>
      <form
        method="get"
        aria-label={i18n.t("Filter wager history")}
        class="filter-bar"
      >
        <input type="hidden" name="tab" value="bets" />
        {#each selects as select (select.id)}
          <div>
            <label for={select.id} class="field-label"
              >{i18n.t(select.label)}</label
            >
            <select
              id={select.id}
              name={select.name}
              class="control-select"
              value={select.value}
            >
              {#each select.options as [value, label] (value)}
                <option {value}>{i18n.t(label)}</option>
              {/each}
            </select>
          </div>
        {/each}
        <Button type="submit" size="sm">{i18n.t("Apply filters")}</Button>
      </form>
      {#if historyShown}
        {@const history = historyShown}
        {@const filtersActive =
          data.filters.sport !== "all" ||
          data.filters.outcome !== "all" ||
          data.filters.range !== "all" ||
          data.filters.scope !== "all"}
        <div
          class="stale-area"
          aria-busy={reloading || undefined}
          bind:this={historyRoot}
        >
          <BetsHistory
            items={history.items}
            emptyState={filtersActive
              ? {
                  title: "No wagers match these filters",
                  copy: "Try a different sport, outcome, or time range.",
                }
              : {
                  title: "No wagers yet",
                  copy: "Place a free-to-play wager from a game page to see your history here.",
                }}
          />
          <div class="panel-body flex items-center justify-between">
            {#if data.page > 1}
              <Button
                href={historyHref(data.page - 1)}
                variant="secondary"
                size="sm"
              >
                {i18n.t("Prev")}
              </Button>
            {:else}
              <Button variant="secondary" size="sm" disabled
                >{i18n.t("Prev")}</Button
              >
            {/if}
            {#if history.hasMore}
              <Button
                href={historyHref(data.page + 1)}
                variant="secondary"
                size="sm"
              >
                {i18n.t("Next")}
              </Button>
            {:else}
              <Button variant="secondary" size="sm" disabled
                >{i18n.t("Next")}</Button
              >
            {/if}
          </div>
        </div>
      {:else}
        <div
          class="panel loading-panel"
          role="status"
          aria-label={i18n.t("Loading…")}
        ></div>
      {/if}
    </section>
  {/if}
{/snippet}

{#snippet settingsPanel()}
  {#if data.status === "ready"}
    <section class="panel" aria-labelledby="you-settings-heading">
      <div class="panel-header">
        <h2 class="panel-title" id="you-settings-heading">
          {i18n.t("Settings")}
        </h2>
      </div>
      <div class="settings-list">
        <NavigationLink class="settings-row" href="/rules">
          <span>{i18n.t("Rules")}</span>
          <ChevronRight aria-hidden="true" size={18} />
        </NavigationLink>
        <NavigationLink class="settings-row" href="/system">
          <span>{i18n.t("System")}</span>
          <ChevronRight aria-hidden="true" size={18} />
        </NavigationLink>
        <div class="settings-row">
          <span>{i18n.t("Language")}</span>
          <LanguageSwitch />
        </div>
        <div class="settings-row">
          <span>
            {i18n.t("Reset your bankroll back to the starting balance.")}
            {#await data.resetCount then resets}
              {#if resets > 0}
                <span class="fine-print">
                  {i18n.t("Times reset:")}
                  {i18n.formatNumber(resets)}
                  {i18n.t("— a reset makes this record less meaningful.")}
                </span>
              {/if}
            {/await}
          </span>
          <ResetBankroll />
        </div>
        <form class="settings-row" method="POST" action="/sign-out">
          <span>{data.email ?? i18n.t("Signed in")}</span>
          <Button type="submit" variant="secondary" size="sm"
            >{i18n.t("Sign out")}</Button
          >
        </form>
      </div>
    </section>
  {/if}
{/snippet}
