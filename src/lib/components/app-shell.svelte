<script lang="ts">
  import type { Snippet } from "svelte";
  import NavigationProvider from "./navigation-provider.svelte";
  import ShellContent from "./shell-content.svelte";

  let {
    children,
    accountControl,
  }: { children: Snippet; accountControl?: Snippet } = $props();
</script>

<NavigationProvider>
  <ShellContent {accountControl}>
    {@render children()}
  </ShellContent>
</NavigationProvider>
