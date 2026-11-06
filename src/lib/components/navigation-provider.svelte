<script lang="ts">
  import type { Snippet } from "svelte";
  import { goto, beforeNavigate, afterNavigate } from "$app/navigation";
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
  let request = 0;

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
      const current = ++request;
      const pathname = new URL(href, window.location.href).pathname;
      // Start loading at the tap; retain the current page until the destination is ready.
      destination = { href, pathname, metadata };
      flying = true;
      void goto(resolve(asRoute(href)), {
        replace: options?.replace,
        reset: options?.scroll !== false,
      })
        .catch(() => {
          // The router owns its error page; a cancelled goto can reject.
        })
        .finally(() => {
          if (current === request) flying = false;
        });
    },
  });

  // Keep the current screen while a history destination loads.
  beforeNavigate((navigation) => {
    if (navigation.type !== "popstate" || !navigation.to) return;
    request++;
    const url = navigation.to.url;
    destination = { href: url.href, pathname: url.pathname };
    flying = true;
  });
  afterNavigate(() => {
    flying = false;
  });
</script>

{@render children()}
