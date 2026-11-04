<script lang="ts">
  import type { ContextBlock, StatRow } from "#lib/shared/game-view";
  import { useTranslation } from "../language.svelte";

  let {
    blocks,
    homeTeam,
    awayTeam,
  }: {
    blocks: ContextBlock[];
    homeTeam: string;
    awayTeam: string;
  } = $props();

  const i18n = useTranslation();

  function display(row: StatRow, text: string) {
    if (i18n.locale === "es" && row.format === "mono") {
      return text
        .replace(
          /(\d+)([WDL])\b/g,
          (_, count: string, result: string) => `${count}${i18n.t(result)}`,
        )
        .replace(
          /^([WL])(\d+)$/,
          (_, result: string, count: string) => `${i18n.t(result)}${count}`,
        );
    }
    return i18n.t(text);
  }

  // A form row is two teams' letters. Side by side they read as one run, so
  // each side becomes its own labelled statement.
  function expandForm(rows: StatRow[]) {
    return rows.flatMap((row) =>
      row.format === "form" && (row.home ?? row.away)
        ? [
            {
              ...row,
              label: homeTeam,
              value: row.home,
              home: undefined,
              away: undefined,
            },
            {
              ...row,
              label: awayTeam,
              value: row.away,
              home: undefined,
              away: undefined,
            },
          ].filter((side) => side.value)
        : [row],
    );
  }
</script>

{#snippet valueView(row: StatRow, text: string)}
  {#if row.format === "form"}
    <!-- Tone keys on the provider's W/D/L, not the translated letter. -->
    <span class="mp-form">
      {#each text.split("") as letter, index (`${letter}-${index}`)}
        <b data-result={letter}>{i18n.t(letter)}</b>
      {/each}
    </span>
  {:else}
    <span data-mono={row.format === "mono" ? "" : undefined}
      >{display(row, text)}</span
    >
  {/if}
{/snippet}

{#snippet rowView(row: StatRow, compare: boolean)}
  {#if compare && (row.home !== undefined || row.away !== undefined)}
    <div class="mp-row mp-row-vs">
      <span class="mp-row-label">{i18n.t(row.label)}</span>
      <span class="mp-row-home">
        {#if row.home}
          {@render valueView(row, row.home)}
        {/if}
      </span>
      <span class="mp-row-away">
        {#if row.away}
          {@render valueView(row, row.away)}
        {/if}
      </span>
    </div>
  {:else}
    {@const stated = row.value ?? row.home ?? row.away}
    <div class="mp-row">
      {#if row.label}
        <span class="mp-row-label">{i18n.t(row.label)}</span>
      {/if}
      {#if stated}
        <span class="mp-row-value">{@render valueView(row, stated)}</span>
      {/if}
      {#if row.note}
        <span class="mp-row-note">{i18n.t(row.note)}</span>
      {/if}
    </div>
  {/if}
{/snippet}

{#if blocks.length > 0}
  <div class="mp-blocks">
    {#each blocks as block (block.id)}
      {@const rows = expandForm(block.rows)}
      {@const compares =
        rows.some((row) => row.home !== undefined) &&
        rows.some((row) => row.away !== undefined)}
      <section class="mp-block">
        <h2 class="mp-block-title">{i18n.t(block.title)}</h2>
        {#if compares}
          <div class="mp-row mp-row-vs mp-row-heads">
            <span class="mp-row-label"></span>
            <span class="mp-row-home">{homeTeam}</span>
            <span class="mp-row-away">{awayTeam}</span>
          </div>
        {/if}
        {#each rows as row, index (`${block.id}-${index}`)}
          {@render rowView(row, compares)}
        {/each}
        {#if block.detail}
          <details class="mp-deeper" open>
            <summary>{i18n.t("Deeper numbers")}</summary>
            {#each expandForm(block.detail) as row, index (`${block.id}-detail-${index}`)}
              {@render rowView(row, compares)}
            {/each}
          </details>
        {/if}
      </section>
    {/each}
  </div>
{/if}
