<script lang="ts">
  import type { Component } from "svelte";

  type Props = {
    authConfigured: boolean;
    signedIn: boolean;
    balance?: number;
    won?: number;
    lost?: number;
    openCount?: number;
  };

  let props: Props = $props();
  let Control = $state<Component<Props> | null>(null);

  $effect(() => {
    if (!Control) {
      void import("./account-control.svelte").then((module) => {
        Control = module.default;
      });
    }
  });
</script>

{#if Control}
  {@const Panel = Control}
  <Panel {...props} />
{/if}
