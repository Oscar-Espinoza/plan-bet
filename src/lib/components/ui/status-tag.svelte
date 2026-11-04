<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "#lib/shared/utils";
  import { useTranslation } from "../language.svelte";

  const TONE_LABELS: Record<string, string> = {
    positive: "Positive: ",
    warning: "Warning: ",
    negative: "Negative: ",
  };

  let {
    children,
    tone = "neutral",
    class: className = "",
  }: {
    children: Snippet;
    tone?: "neutral" | "positive" | "warning" | "negative";
    class?: string;
  } = $props();

  const i18n = useTranslation();
  const toneLabel = $derived(TONE_LABELS[tone]);
</script>

<span class={cn("status-tag", `status-${tone}`, className)}>
  {#if toneLabel}
    <span class="sr-only">{i18n.t(toneLabel)}</span>
  {/if}
  {@render children()}
</span>
