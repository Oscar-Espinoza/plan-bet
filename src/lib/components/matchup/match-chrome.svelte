<script lang="ts">
  import type { MatchView } from "#lib/shared/game-view";
  import { useTranslation } from "../language.svelte";
  import Scorebug from "./scorebug.svelte";

  export type MatchTab = "overview" | "stats" | "lineups" | "h2h";
  type MatchHeaderView = Pick<MatchView, "identity" | "timing">;

  const TABS: { id: MatchTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "stats", label: "Stats" },
    { id: "lineups", label: "Lineups" },
    { id: "h2h", label: "H2H" },
  ];

  let {
    view,
    tab = "overview",
    onTabChange,
  }: {
    view?: MatchHeaderView;
    tab?: MatchTab;
    onTabChange?: (tab: MatchTab) => void;
  } = $props();

  const i18n = useTranslation();

  function moveTab(event: KeyboardEvent, index: number) {
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? TABS.length - 1
          : direction
            ? (index + direction + TABS.length) % TABS.length
            : -1;
    if (next < 0 || !onTabChange) return;
    event.preventDefault();
    const target = TABS[next];
    if (!target) return;
    onTabChange(target.id);
    requestAnimationFrame(() =>
      document.getElementById(`match-tab-${target.id}`)?.focus(),
    );
  }
</script>

<p class="mp-breadcrumb">
  {#if view}
    <span
      >{i18n.t(view.identity.sport === "soccer" ? "Soccer" : "Baseball")}</span
    >
    <span aria-hidden="true">›</span>
    <span>{i18n.t(view.identity.competition)}</span>
  {:else}
    <span class="match-placeholder" aria-hidden="true">
      <span>{i18n.t("Match information")}</span>
    </span>
  {/if}
</p>
{#if view}
  <Scorebug identity={view.identity} timing={view.timing} />
{:else}
  <header class="mp-bug match-header-skeleton" aria-hidden="true">
    <span class="mp-status-pill match-placeholder"
      ><span>{i18n.t("Upcoming")}</span></span
    >
    <div class="mp-sides">
      {#each ["Home", "Away"] as side, index (side)}
        <div class="mp-side" style:grid-column={index ? 3 : 1}>
          <span class="mp-side-team">
            <span class="team-logo match-placeholder"></span>
            <span class="mp-side-name match-placeholder"
              ><span>{i18n.t(side)}</span></span
            >
          </span>
        </div>
      {/each}
    </div>
    <div class="mp-clock">
      <span class="match-placeholder"
        ><span>{i18n.t("Kickoff in")} 00d 00h</span></span
      >
    </div>
    <div class="mp-when">
      <span class="match-placeholder"><span>00 / 00 / 0000 · 00:00</span></span>
    </div>
  </header>
{/if}
<div
  class="mp-tabs"
  role={onTabChange ? "tablist" : undefined}
  aria-label={onTabChange ? i18n.t("Match information") : undefined}
  aria-hidden={onTabChange ? undefined : true}
>
  {#each TABS as { id, label }, index (id)}
    <button
      type="button"
      role="tab"
      id={onTabChange ? `match-tab-${id}` : undefined}
      aria-controls={onTabChange ? `match-panel-${id}` : undefined}
      aria-selected={tab === id}
      tabindex={onTabChange && tab === id ? 0 : -1}
      disabled={!onTabChange}
      onclick={() => onTabChange?.(id)}
      onkeydown={(event) => moveTab(event, index)}
    >
      {i18n.t(label)}
    </button>
  {/each}
</div>
