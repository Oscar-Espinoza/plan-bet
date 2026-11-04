<script lang="ts">
  import { useTranslation } from "./language.svelte";
  import { viewerClock } from "./clock.svelte";

  let { value }: { value: string } = $props();
  const i18n = useTranslation();
  const clock = viewerClock();
  let ticked = $state(0);
  const now = $derived(ticked || clock.now());

  $effect(() => {
    const target = new Date(value).getTime();
    const step = () => {
      ticked = Date.now();
    };
    step();
    const remaining = target - Date.now();
    if (remaining <= 0 || remaining >= 86_400_000) return;
    const id = setInterval(step, 1000);
    return () => clearInterval(id);
  });

  const remaining = $derived(new Date(value).getTime() - now);
  const seconds = $derived(Math.floor(remaining / 1000));
  const days = $derived(Math.floor(seconds / 86_400));
  const pad = (n: number) => String(n).padStart(2, "0");
</script>

{#if now === 0}
  <time datetime={value}></time>
{:else if remaining <= 0}
  <time datetime={value}>{i18n.t("Underway")}</time>
{:else}
  <time datetime={value}>
    {days > 0
      ? `${days}d ${pad(Math.floor((seconds % 86_400) / 3600))}h`
      : `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`}
  </time>
{/if}
