<script lang="ts">
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";
  import { fullCssReady } from "./full-css";
  import { resolve } from "$app/paths";
  import { asRoute } from "./href";
  import {
    provideNavigation,
    type Destination,
    type PreviewMetadata,
  } from "./navigation.svelte";

  let { children }: { children: Snippet } = $props();
  let destination = $state<Destination | null>(null);
  let flying = $state(false);

  provideNavigation({
    get pending() {
      return flying ? destination : null;
    },
    get destination() {
      return destination;
    },
    navigate(
      href: string,
      metadata?: PreviewMetadata,
      options?: { replace?: boolean; scroll?: boolean },
    ) {
      const url = new URL(href, window.location.href);
      // The preview mounts new markup. Hold it until the full sheet is
      // applied so a throttled stylesheet cannot flash an unstyled page.
      void fullCssReady().then(() => {
        destination = { href, pathname: url.pathname, metadata };
        flying = true;
        void goto(resolve(asRoute(href)), {
          replace: Boolean(options?.replace),
          reset: options?.scroll !== false,
        }).finally(() => {
          flying = false;
        });
      });
    },
  });

  $effect(() => {
    const cancel = () => {
      destination = null;
      flying = false;
    };
    window.addEventListener("popstate", cancel);
    return () => window.removeEventListener("popstate", cancel);
  });
</script>

{@render children()}
