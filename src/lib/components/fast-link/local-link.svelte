<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { SvelteURL } from "svelte/reactivity";
  import { asRoute } from "../href";
  import {
    useNavigationPreview,
    type PreviewMetadata,
  } from "../navigation.svelte";
  import NavigationLink from "./navigation-link.svelte";

  type Props = Omit<HTMLAnchorAttributes, "href" | "children"> & {
    href: string;
    preview?: PreviewMetadata;
    children?: Snippet;
    replace?: boolean;
    scroll?: boolean;
    preloadCode?: "hover" | "viewport" | "tap" | "off" | "";
    preloadData?: "hover" | "viewport" | "tap" | "off" | "";
  };

  let { href, onclick, children, preloadCode, preloadData, ...rest }: Props =
    $props();

  const navigation = useNavigationPreview();
  const samePath = $derived(href.split(/[?#]/)[0] === page.url.pathname);

  function onClick(
    event: MouseEvent & { currentTarget: EventTarget & HTMLAnchorElement },
  ) {
    onclick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === "_blank"
    ) {
      return;
    }
    const url = new URL(href, window.location.href);
    if (
      url.origin !== window.location.origin ||
      url.pathname !== page.url.pathname ||
      navigation?.pending
    ) {
      return;
    }
    event.preventDefault();
    if (url.pathname === "/you" && url.searchParams.has("section")) {
      const current = new SvelteURL(window.location.href);
      current.searchParams.set(
        "section",
        url.searchParams.get("section") ?? "",
      );
      current.hash = url.hash;
      void goto(
        resolve(asRoute(`${current.pathname}${current.search}${current.hash}`)),
        {
          shallow: true,
          reset: false,
        },
      );
    } else {
      void goto(resolve(asRoute(`${url.pathname}${url.search}${url.hash}`)), {
        shallow: true,
        reset: false,
      });
    }
    if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView();
  }
</script>

<NavigationLink
  {href}
  {...rest}
  preloadCode={samePath ? "off" : (preloadCode ?? "tap")}
  preloadData={samePath ? "off" : (preloadData ?? "tap")}
  onclick={onClick}
>
  {@render children?.()}
</NavigationLink>
