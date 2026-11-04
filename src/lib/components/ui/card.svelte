<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "#lib/shared/utils";

  let {
    title,
    titleId,
    headerExtra,
    children,
    class: className = "",
  }: {
    title: Snippet;
    titleId: string;
    headerExtra?: Snippet;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<section class={cn("panel", className)} aria-labelledby={titleId}>
  <div class="panel-header">
    <h2 class="panel-title" id={titleId}>
      {@render title()}
    </h2>
    {#if headerExtra}
      {@render headerExtra()}
    {/if}
  </div>
  {@render children()}
</section>
