<script lang="ts">
  import Ticket from "@lucide/svelte/icons/ticket";
  import {
    inMarketCategory,
    marketsFor,
    namedSelection,
    type Market,
  } from "#lib/shared/markets";
  import { useTranslation } from "../language.svelte";
  import Button from "../ui/button.svelte";

  let {
    sport = "soccer",
    finished = false,
    matchup,
  }: {
    sport?: "soccer" | "baseball";
    finished?: boolean;
    matchup?: { home: string; away: string };
  } = $props();

  const i18n = useTranslation();
  const filters = $derived([
    "Popular",
    sport === "soccer" ? "Goals" : "Runs",
    "Teams",
  ]);
  const markets = $derived(
    marketsFor(sport).filter((market: Market) =>
      inMarketCategory(market, "popular"),
    ),
  );
</script>

<aside
  class="mp-action"
  role="status"
  aria-label={i18n.t("Loading…")}
  aria-busy="true"
>
  <section class="panel wager-panel" aria-hidden="true">
    <div class="panel-header">
      <div>
        <h2 class="panel-title">
          {#if !finished}
            <Ticket class="bet-ticket-icon" />
          {/if}
          <span>{i18n.t(finished ? "Your match results" : "Make a bet")}</span>
        </h2>
        <p class="panel-purpose">
          {i18n.t(
            finished
              ? "Your bets and returns for this match."
              : "Simulate a bet on this match with fictional credits.",
          )}
        </p>
      </div>
      {#if !finished}
        <span class="bet-balance">
          <small>{i18n.t("Balance")}</small>
          <span class="match-placeholder">0,000</span>
        </span>
      {/if}
    </div>
    {#if !finished}
      <div class="selection-grid">
        <div class="market-filters">
          {#each filters as label, index (label)}
            <button disabled type="button" aria-pressed={index === 0}
              >{i18n.t(label)}</button
            >
          {/each}
        </div>
        {#each markets as market (market.id)}
          <div class="selection-market">
            <h3 class="field-label">
              <span class="match-placeholder">{i18n.t(market.label)}</span>
            </h3>
            {#if market.kind === "exact_score"}
              <div class="mp-score">
                <label class="mp-score-team">
                  <span>{matchup?.home ?? i18n.t("Home")}</span>
                  <input
                    disabled
                    readonly
                    type="number"
                    value=""
                    class="match-placeholder"
                  />
                </label>
                <span class="mp-score-dash">–</span>
                <label class="mp-score-team">
                  <span>{matchup?.away ?? i18n.t("Away")}</span>
                  <input
                    disabled
                    readonly
                    type="number"
                    value=""
                    class="match-placeholder"
                  />
                </label>
                <p class="mp-score-price">
                  <span class="match-placeholder">{i18n.t("Type a score")}</span
                  >
                </p>
              </div>
            {:else}
              <div class="selection-row">
                {#each market.selections as selection (selection.id)}
                  <div class="selection-button">
                    <span class="match-placeholder">
                      {i18n.t(namedSelection(market, selection, matchup))}
                    </span>
                    <span class="match-placeholder">0.00</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        <p class="bet-hint">
          <span class="match-placeholder">
            {i18n.t("Nothing picked yet — tap any price above to set a stake.")}
          </span>
        </p>
      </div>
      <Button type="button" class="w-full" disabled>
        <span class="match-placeholder">{i18n.t("Choose a selection")}</span>
      </Button>
      <span class="action-bar-label">{i18n.t("Returns")}</span>
      <span class="return-figure"><span class="match-placeholder">—</span></span
      >
      <div class="wager-feedback"></div>
    {/if}
  </section>
</aside>
