<script lang="ts">
  import type { Snippet } from "svelte";
  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import Info from "@lucide/svelte/icons/info";
  import Trophy from "@lucide/svelte/icons/trophy";
  import type { MatchView } from "#lib/shared/game-view";
  import { useTranslation } from "./language.svelte";
  import ContextBlocks from "./matchup/context-blocks.svelte";
  import MatchChrome, { type MatchTab } from "./matchup/match-chrome.svelte";
  import StatusRibbon from "./matchup/status-ribbon.svelte";

  let {
    view,
    wageringPanel,
    socialPanel,
  }: {
    view: MatchView;
    wageringPanel?: Snippet;
    socialPanel?: Snippet;
  } = $props();

  const i18n = useTranslation();
  let tab = $state<MatchTab>("overview");

  const homeTeam = $derived(view.identity.homeTeam);
  const awayTeam = $derived(view.identity.awayTeam);
  const result = $derived(view.timing.result);
  const form = $derived(view.blocks.filter((block) => block.id === "form"));
  const standing = $derived(
    view.blocks.filter((block) => ["table", "standing"].includes(block.id)),
  );
  const headToHead = $derived(
    view.blocks.filter((block) => block.id === "h2h"),
  );
  const stats = $derived(
    view.blocks.filter(
      (block) => !["form", "table", "standing", "h2h"].includes(block.id),
    ),
  );
  const winner = $derived(
    result
      ? result.homeScore === result.awayScore
        ? undefined
        : result.homeScore > result.awayScore
          ? homeTeam
          : awayTeam
      : undefined,
  );
</script>

{#snippet empty(kind: "stats" | "info", title: string, copy: string)}
  <div class="match-empty">
    <span>
      {#if kind === "stats"}
        <BarChart3 aria-hidden="true" />
      {:else}
        <Info aria-hidden="true" />
      {/if}
    </span>
    <div>
      <strong>{i18n.t(title)}</strong>
      <p>{i18n.t(copy)}</p>
    </div>
  </div>
{/snippet}

<div class="mp">
  <h1 class="sr-only">
    {#if result}
      {i18n.t("{p0} {p1} – {p2} {p3}, final", {
        p0: homeTeam,
        p1: result.homeScore,
        p2: result.awayScore,
        p3: awayTeam,
      })}
    {:else}
      {i18n.t("{p0} vs {p1}", { p0: homeTeam, p1: awayTeam })}
    {/if}
  </h1>

  <MatchChrome {view} {tab} onTabChange={(next) => (tab = next)} />

  <div
    class="mp-tab-panel"
    role="tabpanel"
    id={`match-panel-${tab}`}
    aria-labelledby={`match-tab-${tab}`}
  >
    {#if tab === "overview"}
      <div class="mp-overview">
        <StatusRibbon status={view.timing.status} />
        {#if result}
          <div class="match-result-banner">
            <Trophy aria-hidden="true" />
            <p>
              <strong>{i18n.t("Match finished")}</strong>
              <span>
                {#if winner}
                  {i18n.t("{p0} wins {p1}–{p2}", {
                    p0: winner,
                    p1: result.homeScore,
                    p2: result.awayScore,
                  })}
                {:else}
                  {i18n.t("Draw {p0}–{p1}", {
                    p0: result.homeScore,
                    p1: result.awayScore,
                  })}
                {/if}
              </span>
            </p>
          </div>
        {/if}
        {#if wageringPanel}
          {@render wageringPanel()}
        {/if}
        {#if socialPanel}
          {@render socialPanel()}
        {/if}
        <ContextBlocks blocks={[...form, ...standing]} {homeTeam} {awayTeam} />
      </div>
    {:else if tab === "stats"}
      {#if stats.length}
        <ContextBlocks blocks={stats} {homeTeam} {awayTeam} />
      {:else}
        {@render empty(
          "stats",
          "Stats unavailable",
          "This provider has not supplied detailed statistics for this matchup.",
        )}
      {/if}
    {:else if tab === "lineups"}
      {@render empty(
        "info",
        "Lineups unavailable",
        "Confirmed lineups have not been supplied for this matchup.",
      )}
    {:else if headToHead.length}
      <ContextBlocks blocks={headToHead} {homeTeam} {awayTeam} />
    {:else}
      {@render empty(
        "info",
        "Head-to-head unavailable",
        "No reliable head-to-head record is available for these teams.",
      )}
    {/if}
  </div>
</div>
