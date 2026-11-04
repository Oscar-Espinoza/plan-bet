<script lang="ts">
  import { untrack } from "svelte";
  import type { Market } from "#lib/shared/markets";
  import { useTranslation } from "../language.svelte";

  let {
    market,
    home,
    away,
    armedId,
    onArm,
  }: {
    market: Market;
    home: string;
    away: string;
    armedId?: string;
    onArm: (selectionId?: string) => void;
  } = $props();

  const i18n = useTranslation();
  const seeded = untrack(() => armedId?.split("-") ?? []);
  let homeScore = $state(seeded[0] ?? "");
  let awayScore = $state(seeded[1] ?? "");

  const priced = $derived(
    market.selections.find(
      (selection) => selection.id === `${homeScore}-${awayScore}`,
    ),
  );
  const complete = $derived(homeScore !== "" && awayScore !== "");

  function change(side: "home" | "away", raw: string) {
    const next = raw.replace(/[^0-9]/g, "").slice(0, 1);
    if (side === "home") homeScore = next;
    else awayScore = next;
    const id = `${homeScore}-${awayScore}`;
    onArm(
      homeScore &&
        awayScore &&
        market.selections.some((selection) => selection.id === id)
        ? id
        : undefined,
    );
  }
</script>

<div class="mp-score">
  <label class="mp-score-team">
    <span>{home}</span>
    <input
      type="text"
      inputmode="numeric"
      pattern="[0-3]"
      maxlength="1"
      autocomplete="off"
      placeholder="0"
      aria-label={i18n.t("{p0} goals", { p0: home })}
      value={homeScore}
      oninput={(event) => change("home", event.currentTarget.value)}
    />
  </label>
  <span class="mp-score-dash" aria-hidden="true">&ndash;</span>
  <label class="mp-score-team">
    <span>{away}</span>
    <input
      type="text"
      inputmode="numeric"
      pattern="[0-3]"
      maxlength="1"
      autocomplete="off"
      placeholder="0"
      aria-label={i18n.t("{p0} goals", { p0: away })}
      value={awayScore}
      oninput={(event) => change("away", event.currentTarget.value)}
    />
  </label>
  <p class="mp-score-price" data-unpriced={priced ? undefined : ""}>
    {#if priced}
      {i18n.t("Pays {p0}", { p0: i18n.formatNumber(priced.price, 2) })}
    {:else if complete}
      {i18n.t("Not priced — 0-0 through 3-3 only")}
    {:else}
      {i18n.t("Type a score")}
    {/if}
  </p>
</div>
