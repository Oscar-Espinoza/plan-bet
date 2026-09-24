"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";
import {
  useNavigationPreview,
  type PreviewMetadata,
} from "@/components/navigation-preview";

type Props = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  preview?: PreviewMetadata;
};

export function NavigationLink({ href, preview, onNavigate, ...props }: Props) {
  const navigation = useNavigationPreview();
  return (
    <Link
      {...props}
      href={href}
      onNavigate={(event) => {
        let prevented = false;
        onNavigate?.({
          preventDefault() {
            prevented = true;
            event.preventDefault();
          },
        });
        if (prevented || !navigation) return;
        const url = new URL(href, window.location.href);
        if (
          url.origin !== window.location.origin ||
          (url.pathname === window.location.pathname &&
            url.search === window.location.search &&
            !navigation.pending)
        )
          return;
        event.preventDefault();
        navigation.navigate(href, preview, {
          replace: props.replace,
          scroll: props.scroll,
        });
      }}
    />
  );
}

/** Native history keeps local filters addressable without another RSC request. */
export function LocalLink({ href, onClick, ...props }: Props) {
  const pathname = usePathname();
  const navigation = useNavigationPreview();
  return (
    <NavigationLink
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
        if (
          url.origin !== window.location.origin ||
          url.pathname !== pathname ||
          navigation?.pending
        )
          return;
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
  visiblePrefetch = false,
  ref,
  ...props
}: Props & { eager?: boolean; visiblePrefetch?: boolean }) {
  const router = useRouter();
  const element = useRef<HTMLAnchorElement | null>(null);
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
  useEffect(() => {
    if (!eager && !visiblePrefetch) return;
    if (typeof IntersectionObserver === "undefined") return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (
      connection?.saveData ||
      /(^|-)[23]g$/.test(connection?.effectiveType ?? "")
    )
      return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (
        lastPrefetch.current.href !== props.href ||
        Date.now() - lastPrefetch.current.time >= 30_000
      ) {
        lastPrefetch.current = { href: props.href, time: Date.now() };
        router.prefetch(props.href);
      }
      observer.disconnect();
    });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [eager, visiblePrefetch, props.href, router]);
  return (
    <NavigationLink
      {...props}
      ref={(node) => {
        element.current = node;
        if (typeof ref === "function") return ref(node);
        if (ref) ref.current = node;
      }}
      prefetch={false}
      onPointerEnter={(event) => {
        props.onPointerEnter?.(event);
        prefetch();
      }}
      onFocus={(event) => {
        props.onFocus?.(event);
        prefetch();
      }}
      onTouchStart={(event) => {
        props.onTouchStart?.(event);
        prefetch();
      }}
    />
  );
}
