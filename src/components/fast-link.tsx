"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, type ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/** Native history keeps local filters addressable without another RSC request. */
export function LocalLink({ href, onClick, ...props }: Props) {
  const pathname = usePathname();
  return (
    <Link
      {...props}
      href={href}
      prefetch={href.split(/[?#]/)[0] === pathname ? false : props.prefetch}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        )
          return;
        const url = new URL(href, window.location.href);
        if (url.pathname !== pathname) return;
        event.preventDefault();
        // Section links retain the current history filters.
        if (url.pathname === "/you" && url.searchParams.has("section")) {
          const current = new URL(window.location.href);
          current.searchParams.set("section", url.searchParams.get("section")!);
          current.hash = url.hash;
          window.history.pushState(null, "", current);
        } else window.history.pushState(null, "", url);
        if (url.hash)
          document.getElementById(url.hash.slice(1))?.scrollIntoView();
      }}
    />
  );
}

export function MatchLink({
  eager = false,
  ...props
}: Props & { eager?: boolean }) {
  const router = useRouter();
  const lastPrefetch = useRef({ href: "", time: 0 });
  const prefetch = () => {
    if (
      lastPrefetch.current.href === props.href &&
      Date.now() - lastPrefetch.current.time < 30_000
    )
      return;
    lastPrefetch.current = { href: props.href, time: Date.now() };
    router.prefetch(props.href);
  };
  return (
    <Link
      {...props}
      prefetch={eager}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    />
  );
}
