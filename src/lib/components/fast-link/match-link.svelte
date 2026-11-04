<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { slowConnection } from "../connection";
  import type { PreviewMetadata } from "../navigation.svelte";
  import NavigationLink from "./navigation-link.svelte";

  type Props = Omit<HTMLAnchorAttributes, "href" | "children"> & {
    href: string;
    preview?: PreviewMetadata;
    children?: Snippet;
    eager?: boolean;
    visiblePrefetch?: boolean;
    replace?: boolean;
    scroll?: boolean;
  };

  let {
    href,
    children,
    eager = false,
    visiblePrefetch = false,
    ...rest
  }: Props = $props();

  let slow = $state(false);
  $effect(() => {
    const next = slowConnection();
    slow = next;
  });

  const viewport = $derived((eager || visiblePrefetch) && !slow);
</script>

<NavigationLink
  {href}
  {...rest}
  preloadCode={viewport ? "viewport" : "tap"}
  preloadData={viewport ? "hover" : "tap"}
>
  {@render children?.()}
</NavigationLink>
