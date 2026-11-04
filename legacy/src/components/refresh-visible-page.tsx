"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

const INTERVAL = 60_000;

/**
 * Skip a refresh that would cost the reader more than it gives them: on a
 * data-saver connection, or while they are typing a stake or a comment — a
 * full server re-render mid-input is the jank this guards against.
 */
function shouldSkip() {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (connection?.saveData) return true;
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  );
}

/** One refresh per visible page per interval, including tab focus. */
export function RefreshVisiblePage() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  useEffect(() => {
    inFlight.current = pending;
  }, [pending]);
  useEffect(() => {
    if (!(
      pathname === "/" ||
      pathname === "/you" ||
      pathname.startsWith("/games/") ||
      pathname.startsWith("/groups")
    ))
      return;
    let last = Date.now();
    const refresh = () => {
      if (
        document.visibilityState !== "visible" ||
        inFlight.current ||
        Date.now() - last < INTERVAL ||
        shouldSkip()
      )
        return;
      last = Date.now();
      inFlight.current = true;
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, INTERVAL);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pathname, router]);
  return null;
}
