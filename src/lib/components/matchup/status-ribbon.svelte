<script lang="ts">
  import type { MatchView } from "#lib/shared/game-view";
  import { useTranslation } from "../language.svelte";

  const RIBBON: Partial<Record<MatchView["timing"]["status"], string>> = {
    live: "Underway",
    finished: "Full time",
    postponed: "Postponed",
    cancelled: "Cancelled",
  };

  let { status }: { status: MatchView["timing"]["status"] } = $props();
  const i18n = useTranslation();
  const label = $derived(RIBBON[status]);
</script>

{#if label}
  <p class="mp-ribbon" data-status={status}>{i18n.t(label)}</p>
{/if}
