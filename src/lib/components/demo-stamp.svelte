<script lang="ts">
  import CircleDot from "@lucide/svelte/icons/circle-dot";
  import LocalDateTime from "./local-date-time.svelte";
  import { useTranslation } from "./language.svelte";

  let {
    compact = false,
    freshness,
  }: {
    compact?: boolean;
    freshness: { mode: "live" | "stale" | "demo"; fetchedAt: string };
  } = $props();

  const i18n = useTranslation();
  const label = $derived(
    freshness.mode === "live"
      ? "Live provider data"
      : freshness.mode === "stale"
        ? "Stale live data"
        : "Demo snapshot",
  );
</script>

<div
  class="demo-stamp"
  data-mode={freshness.mode}
  title={i18n.t("Fetched {p0}", { p0: freshness.fetchedAt })}
>
  <CircleDot aria-hidden="true" size={12} />
  <span>{i18n.t(label)}</span>
  {#if !compact}
    <span>· <LocalDateTime value={freshness.fetchedAt} short /></span>
  {/if}
</div>
