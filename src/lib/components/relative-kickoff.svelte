<script lang="ts">
  import { useTranslation } from "./language.svelte";
  import { viewerClock } from "./clock.svelte";

  let { value }: { value: string } = $props();
  const i18n = useTranslation();
  const clock = viewerClock();

  function relativeKickoffLabel(kickoff: string, now: number) {
    const diffMs = new Date(kickoff).getTime() - now;
    if (diffMs <= 0) return "Started";
    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `in ${hours}h`;
    return `in ${Math.round(hours / 24)}d`;
  }
</script>

<time datetime={value}>{i18n.t(relativeKickoffLabel(value, clock.now()))}</time>
