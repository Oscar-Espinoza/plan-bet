<script lang="ts">
  import { useTranslation } from "../language.svelte";

  const LIST_ROWS = 5;
  const RECORD_ROWS = 4;

  let {
    label,
    variant,
    panelCount = 2,
  }: {
    label: string;
    variant: "list" | "record";
    panelCount?: number;
  } = $props();

  const i18n = useTranslation();
</script>

{#if variant === "record"}
  <div class="section-grid" role="status" aria-label={i18n.t(label)}>
    <div class="panel loading-panel skeleton-rows">
      {#each Array.from({ length: RECORD_ROWS }, (_, index) => index) as index (index)}
        <div class="skeleton-bar"></div>
      {/each}
    </div>
    {#each Array.from({ length: panelCount - 1 }, (_, index) => index) as index (index)}
      <div class="panel loading-panel"></div>
    {/each}
  </div>
{:else}
  <div class="section-grid" role="status" aria-label={i18n.t(label)}>
    <div class="panel loading-panel skeleton-rows">
      <div class="skeleton-bar skeleton-bar-header"></div>
      {#each Array.from({ length: LIST_ROWS }, (_, index) => index) as index (index)}
        <div class="skeleton-bar skeleton-bar-row"></div>
      {/each}
    </div>
  </div>
{/if}
