<script lang="ts">
  import type { Component } from "svelte";
  import { fullCssReady } from "./full-css";

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
      void Promise.all([
        import("./account-control.svelte"),
        fullCssReady(),
      ]).then(([module]) => {
        Control = module.default;
      });
    }
  });
</script>

{#if Control}
  {@const Panel = Control}
  <Panel {...props} />
{/if}
