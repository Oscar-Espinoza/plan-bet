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
    // A loading preview and its outgoing route can coexist. Only the newest
    // breadcrumb belongs in the header; restore the prior one on cancellation.
    const refresh = () => {
      for (const child of target.children) {
        if (child instanceof HTMLElement) {
          child.style.display =
            child === target.lastElementChild ? "contents" : "none";
        }
      }
    };
    target.append(node);
    refresh();
    return {
      destroy() {
        node.remove();
        refresh();
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
