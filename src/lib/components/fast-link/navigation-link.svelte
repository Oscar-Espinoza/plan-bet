<script lang="ts">
  import { resolve } from "$app/paths";
  import type { Snippet } from "svelte";
  import { asRoute } from "../href";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import {
    useNavigationPreview,
    type PreviewMetadata,
  } from "../navigation.svelte";

  type Props = Omit<HTMLAnchorAttributes, "href" | "children"> & {
    href: string;
    preview?: PreviewMetadata;
    children?: Snippet;
    replace?: boolean;
    scroll?: boolean;
    preloadCode?: "hover" | "viewport" | "tap" | "off" | "";
    preloadData?: "hover" | "viewport" | "tap" | "off" | "";
  };

  let {
    href,
    preview,
    children,
    replace = false,
    scroll,
    preloadCode = "tap",
    preloadData = "tap",
    class: className,
    target,
    onclick,
    ...rest
  }: Props = $props();

  const navigation = useNavigationPreview();

  function onClick(
    event: MouseEvent & { currentTarget: EventTarget & HTMLAnchorElement },
  ) {
    onclick?.(event);
    if (event.defaultPrevented || !navigation) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === "_blank"
    ) {
      return;
    }
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      !navigation.pending
    ) {
      return;
    }
    event.preventDefault();
    navigation.navigate(href, preview, { replace, scroll });
  }
</script>

<a
  href={resolve(asRoute(href))}
  class={className}
  {target}
  data-sveltekit-preload-code={preloadCode}
  data-sveltekit-preload-data={preloadData}
  onclick={onClick}
  {...rest}
>
  {@render children?.()}
</a>
