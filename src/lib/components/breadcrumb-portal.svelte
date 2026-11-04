<script lang="ts" module>
  export const CRUMB_SLOT_ID = "topbar-crumb";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  let { children }: { children: Snippet } = $props();
  let slot = $state<HTMLElement | null>(null);

  onMount(() => {
    slot = document.getElementById(CRUMB_SLOT_ID);
  });

  function relocate(node: HTMLElement, target: HTMLElement) {
    target.append(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }
</script>

{@render children()}
{#if slot}
  <div style="display: contents" use:relocate={slot}>
    {@render children()}
  </div>
{/if}
