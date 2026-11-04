<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Receipt from "@lucide/svelte/icons/receipt";
  import NavigationLink from "./fast-link/navigation-link.svelte";
  import { useTranslation } from "./language.svelte";
  import LocalDateTime from "./local-date-time.svelte";
  import { wagerSelectionLabel } from "#lib/shared/markets";
  import { outcomeTone, settlementLabel } from "#lib/shared/wager-copy";
  import type { SlipWager } from "#lib/shared/wager-view";
  import Button from "./ui/button.svelte";
  import StatusTag from "./ui/status-tag.svelte";

  let {
    items,
    emptyState,
    compact = false,
  }: {
    items: SlipWager[];
    emptyState: { title: string; copy: string };
    compact?: boolean;
  } = $props();

  const i18n = useTranslation();

  function decidingResult(wager: SlipWager) {
    const settlement = wager.settlement;
    if (!settlement) return undefined;
    if (settlement.outcome === "void") return "Voided";
    const score = settlement.finalScore;
    if (!score) return "Not provided";
    return `${score.homeScore}-${score.awayScore}`;
  }
</script>

{#if items.length === 0}
  {#if compact}
    <NavigationLink class="bet-list-empty" href="/">
      <span>{i18n.t(emptyState.title)}</span>
      <span class="bet-list-empty-cta">
        {i18n.t("Explore upcoming games")}
        <ChevronRight aria-hidden="true" size={16} />
      </span>
    </NavigationLink>
  {:else}
    <div class="empty-state">
      <div>
        <span class="empty-icon">
          <Receipt aria-hidden="true" />
        </span>
        <h3 class="empty-title">{i18n.t(emptyState.title)}</h3>
        <p class="empty-copy">{i18n.t(emptyState.copy)}</p>
        <Button href="/" variant="secondary" size="sm" class="mt-4">
          {i18n.t("Explore upcoming games")}
        </Button>
      </div>
    </div>
  {/if}
{:else}
  <ul class="bet-list">
    {#each items as wager (wager.id)}
      {@const settlement = wager.settlement}
      {@const net = settlement ? settlement.returned - wager.stake : undefined}
      {@const result = decidingResult(wager)}
      <li class="bet-row">
        <div class="bet-row-main">
          <NavigationLink
            class="bet-row-match"
            href={`/games/${wager.routeId}`}
          >
            {wager.matchup}
          </NavigationLink>
          <span class="bet-row-pick">
            {i18n.t(wagerSelectionLabel(wager))}
            <span> · {i18n.t(wager.marketLabel)}</span>
          </span>
          <span class="bet-row-meta">
            <span>{i18n.t(wager.competition)}</span>
            <span>{i18n.t("Odds")} {i18n.formatNumber(wager.price, 2)}</span>
            <span>{i18n.t("Stake")} {i18n.formatNumber(wager.stake)}</span>
            {#if result}
              <span>{i18n.t("Result")} {i18n.t(result)}</span>
            {/if}
            <LocalDateTime value={wager.placedAt} short />
          </span>
        </div>
        <div class="bet-row-side">
          {#if settlement}
            <StatusTag tone={outcomeTone(settlement.outcome)}>
              {i18n.t(settlementLabel(settlement.outcome))}
            </StatusTag>
          {:else}
            <StatusTag tone="neutral">{i18n.t("open")}</StatusTag>
          {/if}
          <strong
            class="bet-row-net"
            data-tone={net === undefined ? "open" : net > 0 ? "up" : "down"}
          >
            {net === undefined
              ? "—"
              : `${net > 0 ? "+" : ""}${i18n.formatNumber(net)}`}
          </strong>
        </div>
      </li>
    {/each}
  </ul>
{/if}
