<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import Ticket from "@lucide/svelte/icons/ticket";
  import NavigationLink from "../fast-link/navigation-link.svelte";
  import { useTranslation } from "../language.svelte";
  import LocalDateTime from "../local-date-time.svelte";
  import { accountChip } from "#lib/state/account-chip.svelte";
  import { matchday } from "#lib/state/store.svelte";
  import {
    MIN_STAKE,
    inMarketCategory,
    namedSelection,
    wagerSelectionLabel,
    type Market,
    type MarketCategory,
  } from "#lib/shared/markets";
  import { cn } from "#lib/shared/utils";
  import {
    CLOSED_COPY,
    outcomeTone,
    settlementLabel,
  } from "#lib/shared/wager-copy";
  import type { SlipWager, WagerPanelData } from "#lib/shared/wager-view";
  import Banner from "../ui/banner.svelte";
  import Button from "../ui/button.svelte";
  import StatusTag from "../ui/status-tag.svelte";
  import ScoreEntry from "./score-entry.svelte";

  let {
    data,
    matchup,
  }: {
    data: WagerPanelData;
    matchup?: { home: string; away: string };
  } = $props();

  const i18n = useTranslation();
  const formId = $props.id();

  let overlay = $state<{ balance: number; wagers: SlipWager[] } | null>(null);
  // A new server payload replaces the optimistic balance and list.
  // Confirmation, the armed selection, and the idempotency key stay.
  $effect(() => {
    const current = data;
    overlay = null;
    void current;
  });

  const view = $derived.by(() => {
    if (!overlay || data.state.kind !== "open") return data;
    return {
      ...data,
      state: { ...data.state, balance: overlay.balance },
      wagers: overlay.wagers,
    };
  });

  const openMarkets = $derived(
    view.state.kind === "open" ? view.state.markets : [],
  );
  const balance = $derived(view.state.kind === "open" ? view.state.balance : 0);
  const groups = $derived(view.state.kind === "open" ? view.state.groups : []);
  const byMarket = $derived(
    view.state.kind === "open" ? view.state.byMarket : [],
  );

  type Armed = { marketId: string; selectionId: string };

  function armedFromQuery(): Armed | undefined {
    const [marketId, selectionId] =
      page.url.searchParams.get("pick")?.split(":") ?? [];
    if (!marketId || !selectionId) return undefined;
    const market = openMarkets.find((item) => item.id === marketId);
    if (!market?.selections.some((selection) => selection.id === selectionId))
      return undefined;
    return { marketId, selectionId };
  }

  let armed = $state<Armed | undefined>(armedFromQuery());
  const market = $derived(
    openMarkets.find((item) => item.id === armed?.marketId),
  );
  let category = $state<MarketCategory>(
    untrack(() => market?.category ?? "popular"),
  );
  const selection = $derived(
    market?.selections.find((item) => item.id === armed?.selectionId),
  );
  const reaction = $derived(byMarket.find((slice) => slice.key === market?.id));
  const hasReaction = $derived(
    Boolean(reaction && reaction.won + reaction.lost + reaction.voided > 0),
  );

  let stakeText = $state(String(MIN_STAKE));
  const stake = $derived(Number.parseInt(stakeText, 10) || 0);
  let groupId = $state("");
  let confirmation = $state("");
  let error = $state("");
  let pending = $state(false);
  let confirmationNode = $state<HTMLDivElement | null>(null);
  // One key per unchanged intent. A second Place with the same selection,
  // price, stake, and group resends it (replay). It rotates when any of
  // those change, and Done clears it after a confirmed success.
  let placement: { intent: string; key: string } | null = null;

  const potentialReturn = $derived(
    selection ? Math.round(stake * selection.price) : 0,
  );
  const balanceAfter = $derived(balance - stake);
  const insufficientCredits = $derived(stake > balance);
  const stakeEntered = $derived(stake >= MIN_STAKE);

  $effect(() => {
    const node = confirmationNode;
    if (!confirmation || !node) return;
    node.focus({ preventScroll: true });
    // The tour bar is fixed over the viewport bottom. A confirmation makes
    // the slip taller than the gap above that bar; scroll the document so
    // the place button stays clear of it.
    const bar = node.closest(".bet-bar");
    if (!bar) return;
    const tourTop =
      document.querySelector(".tour-bar")?.getBoundingClientRect().top ??
      window.innerHeight;
    const bottom = bar.getBoundingClientRect().bottom;
    if (bottom > tourTop) window.scrollBy(0, bottom - tourTop + 8);
  });

  function marketHeading(item: Market) {
    return item.team
      ? `${matchup?.[item.team] ?? i18n.t(item.team === "home" ? "Home" : "Away")} · ${i18n.t(item.label)}`
      : i18n.t(item.label);
  }

  function clampStake(value: number, ceiling: number) {
    return Math.min(ceiling, Math.max(MIN_STAKE, value));
  }

  function arm(marketId: string, selectionId: string) {
    armed = { marketId, selectionId };
    confirmation = "";
    error = "";
  }

  function addStake(amount: number) {
    stakeText = String(clampStake(stake + amount, balance));
  }

  function errorText(payload: unknown) {
    if (!payload || typeof payload !== "object" || !("error" in payload))
      return "";
    const body = payload.error;
    if (!body || typeof body !== "object" || !("message" in body)) return "";
    return typeof body.message === "string" ? body.message : "";
  }

  function isSettlement(
    value: unknown,
  ): value is NonNullable<SlipWager["settlement"]> {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    if (
      (row.outcome !== "won" &&
        row.outcome !== "lost" &&
        row.outcome !== "void") ||
      typeof row.returned !== "number"
    ) {
      return false;
    }
    if (row.finalScore === undefined) return true;
    if (!row.finalScore || typeof row.finalScore !== "object") return false;
    const score = row.finalScore as Record<string, unknown>;
    return (
      typeof score.homeScore === "number" && typeof score.awayScore === "number"
    );
  }

  function isSlipWager(value: unknown): value is SlipWager {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.routeId !== "string" ||
      typeof row.selectionId !== "string" ||
      typeof row.selectionLabel !== "string" ||
      typeof row.marketLabel !== "string" ||
      typeof row.price !== "number" ||
      typeof row.stake !== "number" ||
      typeof row.potentialReturn !== "number" ||
      typeof row.placedAt !== "string" ||
      typeof row.matchup !== "string" ||
      typeof row.competition !== "string"
    ) {
      return false;
    }
    if (row.line !== undefined && typeof row.line !== "number") return false;
    if (row.settlement !== undefined && !isSettlement(row.settlement))
      return false;
    return true;
  }

  // The route already validated this. A hand-written check, not zod.
  function readPlacement(payload: unknown): {
    wager: SlipWager;
    balance: number;
  } | null {
    if (!payload || typeof payload !== "object" || !("data" in payload))
      return null;
    const body = payload.data;
    if (!body || typeof body !== "object") return null;
    const row = body as Record<string, unknown>;
    if (!isSlipWager(row.wager)) return null;
    if (!row.summary || typeof row.summary !== "object") return null;
    const summary = row.summary as Record<string, unknown>;
    if (typeof summary.balance !== "number") return null;
    return { wager: row.wager, balance: summary.balance };
  }

  const ambiguous =
    "We couldn't confirm the bet. Try again — it won't be placed twice.";

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!market || !selection || pending || insufficientCredits) return;
    if (!stakeEntered) return;
    pending = true;
    error = "";
    // Price is echoed for the server's price_moved check. Potential return
    // is never sent; the house table computes it.
    const request = {
      routeId: view.routeId,
      marketId: market.id,
      selectionId: selection.id,
      price: selection.price,
      stake,
      groupId: groupId || undefined,
    };
    const intent = JSON.stringify(request);
    if (placement?.intent !== intent) {
      placement = { intent, key: crypto.randomUUID() };
    }
    const response = await fetch("/api/bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, idempotencyKey: placement.key }),
    }).catch(() => null);
    const payload: unknown = await response?.json().catch(() => null);
    pending = false;
    if (!response?.ok) {
      error = errorText(payload) || ambiguous;
      return;
    }
    const result = readPlacement(payload);
    if (!result) {
      error = ambiguous;
      return;
    }
    overlay = {
      balance: result.balance,
      wagers: [
        result.wager,
        ...view.wagers.filter((wager) => wager.id !== result.wager.id),
      ],
    };
    accountChip.setBalance(result.balance);
    confirmation = i18n.t(
      "Placed {p0} on {p1} → returns {p2}. New balance: {p3}.",
      {
        p0: result.wager.stake,
        p1: i18n.t(wagerSelectionLabel(result.wager)),
        p2: result.wager.potentialReturn,
        p3: result.balance,
      },
    );
    matchday.advanceTour(2);
    void refreshAll();
  }

  function done() {
    confirmation = "";
    placement = null;
    armed = undefined;
    stakeText = String(MIN_STAKE);
    groupId = "";
    error = "";
  }

  const categories = ["popular", "totals", "teams"] as const;
</script>

<section class="panel wager-panel" aria-labelledby="wager-heading">
  <div class="panel-header">
    <div>
      <h2 class="panel-title" id="wager-heading">
        {#if view.state.kind === "open"}
          <Ticket aria-hidden="true" class="bet-ticket-icon" />
        {/if}
        <span>
          {i18n.t(
            view.state.kind === "open"
              ? "Make a bet"
              : view.state.kind === "closed" && view.state.reason === "finished"
                ? "Your match results"
                : "Betting closed",
          )}
        </span>
      </h2>
      <p class="panel-purpose">
        {i18n.t(
          view.state.kind === "open"
            ? "Simulate a bet on this match with fictional credits."
            : "Your bets and returns for this match.",
        )}
      </p>
    </div>
    {#if view.state.kind === "open"}
      <span class="bet-balance">
        <small>{i18n.t("Balance")}</small>
        {i18n.formatNumber(view.state.balance)}
      </span>
    {/if}
  </div>

  {#if view.state.kind === "unavailable"}
    <p class="side-form">{i18n.t("This game is not open for bets.")}</p>
  {:else if view.state.kind === "closed"}
    <p class="side-form">{i18n.t(CLOSED_COPY[view.state.reason])}</p>
  {:else}
    <div class="selection-grid">
      <div
        class="market-filters"
        role="group"
        aria-label={i18n.t("Bet categories")}
      >
        {#each categories as value (value)}
          <button
            type="button"
            aria-pressed={category === value}
            onclick={() => (category = value)}
          >
            {i18n.t(
              value === "popular"
                ? "Popular"
                : value === "teams"
                  ? "Teams"
                  : openMarkets.some((item) => item.id.startsWith("soccer-"))
                    ? "Goals"
                    : "Runs",
            )}
          </button>
        {/each}
      </div>
      {#if !selection}
        <p class="bet-hint">{i18n.t("Tap any price below to start a bet.")}</p>
      {/if}
      {#each openMarkets as item (item.id)}
        <div
          class="selection-market"
          hidden={!inMarketCategory(item, category)}
        >
          <h3 class="field-label">{marketHeading(item)}</h3>
          {#if item.kind === "exact_score"}
            <ScoreEntry
              market={item}
              home={matchup?.home ?? "Home"}
              away={matchup?.away ?? "Away"}
              armedId={armed?.marketId === item.id
                ? armed.selectionId
                : undefined}
              onArm={(selectionId) =>
                selectionId ? arm(item.id, selectionId) : (armed = undefined)}
            />
          {:else}
            <div
              class="selection-row"
              role="group"
              aria-label={marketHeading(item)}
            >
              {#each item.selections as choice (choice.id)}
                {@const active =
                  armed?.marketId === item.id &&
                  armed.selectionId === choice.id}
                <button
                  type="button"
                  class={cn(
                    "selection-button",
                    active && "selection-button-active",
                  )}
                  aria-pressed={active}
                  onclick={() => arm(item.id, choice.id)}
                >
                  <span>
                    {i18n.t(
                      item.team
                        ? choice.label
                        : namedSelection(item, choice, matchup),
                    )}
                  </span>
                  <span>{i18n.formatNumber(choice.price, 2)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if view.state.kind === "open" && market && selection}
    <form id={formId} class="side-form enter" onsubmit={submit}>
      {#if hasReaction && reaction}
        <p class="fine-print">
          {i18n.t("You’re")}
          {reaction.won}-{reaction.lost}
          {i18n.t("on")}
          {i18n.t(reaction.label)}.
        </p>
      {/if}
      {#if groups.length > 0}
        <label class="bet-group">
          <span class="field-label">{i18n.t("Place")}</span>
          <select
            id="wager-group"
            class="field"
            value={groupId}
            onchange={(event) => (groupId = event.currentTarget.value)}
          >
            <option value="">{i18n.t("Alone")}</option>
            {#each groups as group (group.id)}
              <option value={group.id}>{i18n.t("With")} {group.name}</option>
            {/each}
          </select>
        </label>
      {:else}
        <p class="fine-print">
          {i18n.t("Betting with friends?")}
          <NavigationLink href="/groups/new"
            >{i18n.t("Create a group")}</NavigationLink
          >
          {i18n.t("and your picks show up on its board.")}
        </p>
      {/if}
      <p class="fine-print">
        {i18n.t("Fictional credits, house prices. See the")}
        <NavigationLink href="/rules">{i18n.t("rules")}</NavigationLink>.
      </p>
    </form>
  {/if}

  {#if view.state.kind === "open" && (selection || confirmation || error)}
    <div class="bet-bar" role="region" aria-label={i18n.t("Bet slip")}>
      <div class="wager-feedback" aria-live="polite" aria-atomic="true">
        {#if confirmation}
          <div
            class="bet-confirmation"
            bind:this={confirmationNode}
            tabindex="-1"
          >
            <Banner tone="positive" role="status">{confirmation}</Banner>
            <Button variant="secondary" size="sm" onclick={done}
              >{i18n.t("Done")}</Button
            >
          </div>
        {/if}
        {#if error}
          <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
        {/if}
        {#if insufficientCredits && selection}
          <Banner tone="negative" role="alert">
            {i18n.t("Stake exceeds your balance of")}
            {balance}.
          </Banner>
        {/if}
      </div>
      {#if market && selection}
        <div class="bet-bar-pick">
          <span>
            <strong>{i18n.t(namedSelection(market, selection, matchup))}</strong
            >
            <small>{marketHeading(market)}</small>
          </span>
          <b>{i18n.formatNumber(selection.price, 2)}</b>
        </div>
        <div class="bet-bar-stake">
          <label class="sr-only" for="wager-stake">{i18n.t("Stake")}</label>
          <input
            id="wager-stake"
            form={formId}
            class="field"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            enterkeyhint="done"
            placeholder={i18n.t("Stake")}
            value={stakeText}
            oninput={(event) =>
              (stakeText = event.currentTarget.value.replace(/[^0-9]/g, ""))}
            required
          />
          <div class="bet-bar-returns">
            <span class="field-label">{i18n.t("Returns")}</span>
            <span class="return-figure"
              >{i18n.formatNumber(potentialReturn)}</span
            >
            <small>
              {i18n.t("Balance after")}
              {i18n.formatNumber(Math.max(balanceAfter, 0))}
            </small>
          </div>
        </div>
        <div class="stake-chips">
          <button type="button" onclick={() => addStake(5)}>+5</button>
          <button type="button" onclick={() => addStake(25)}>+25</button>
          <button type="button" onclick={() => addStake(100)}>+100</button>
          <button
            type="button"
            onclick={() => (stakeText = String(clampStake(balance, balance)))}
          >
            {i18n.t("max")}
          </button>
        </div>
        <Button
          type="submit"
          form={formId}
          class="bet-bar-place w-full"
          disabled={pending || insufficientCredits || !stakeEntered}
        >
          {#if pending}
            {i18n.t("Placing…")}
          {:else if stakeEntered}
            {i18n.t(stake === 1 ? "Place {p0} credit" : "Place {p0} credits", {
              p0: stake,
            })}
          {:else}
            {i18n.t("Enter a stake")}
          {/if}
        </Button>
      {/if}
    </div>
  {/if}

  {#if view.wagers.length > 0}
    <div class="side-form">
      <h3 class="field-label">{i18n.t("Your bets on this game")}</h3>
      {#each view.wagers as wager (wager.id)}
        <div class="personal-wager">
          <div class="personal-wager-heading">
            <strong>
              {matchup &&
              (wager.selectionId === "home" || wager.selectionId === "away")
                ? matchup[wager.selectionId]
                : i18n.t(wager.selectionLabel)}
            </strong>
            <StatusTag
              tone={wager.settlement
                ? outcomeTone(wager.settlement.outcome)
                : "neutral"}
            >
              {i18n.t(
                wager.settlement
                  ? settlementLabel(wager.settlement.outcome)
                  : "open",
              )}
            </StatusTag>
          </div>
          <dl>
            <div>
              <dt>{i18n.t("Odds")}</dt>
              <dd>{i18n.formatNumber(wager.price, 2)}</dd>
            </div>
            <div>
              <dt>{i18n.t("Stake")}</dt>
              <dd>{i18n.formatNumber(wager.stake)}</dd>
            </div>
            <div>
              <dt>
                {i18n.t(wager.settlement ? "Returned" : "Potential return")}
              </dt>
              <dd>
                {i18n.formatNumber(
                  wager.settlement?.returned ?? wager.potentialReturn,
                )}
              </dd>
            </div>
          </dl>
          <LocalDateTime value={wager.placedAt} short />
        </div>
      {/each}
    </div>
  {/if}

  {#if view.groupPicks.length > 0}
    <details class="mp-aside">
      <summary>{i18n.t("Group picks on this game")}</summary>
      <div class="side-form">
        {#each view.groupPicks as pick (pick.wager.id)}
          <p class="fine-print">
            {pick.groupName} — {pick.userName ?? i18n.t("A member")}: {pick
              .wager.stake} · {i18n.t(wagerSelectionLabel(pick.wager))}
          </p>
        {/each}
      </div>
    </details>
  {/if}
</section>
