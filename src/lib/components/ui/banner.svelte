<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "#lib/shared/utils";

  let {
    tone = "neutral",
    role = "status",
    class: className = "",
    children,
  }: {
    tone?: "neutral" | "positive" | "warning" | "negative";
    role?: "status" | "alert";
    class?: string;
    children: Snippet;
  } = $props();
</script>

<p {role} class={cn("banner", `banner-${tone}`, className)}>
  {@render children()}
</p>
