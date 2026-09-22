"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

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
        Date.now() - last < 30_000
      )
        return;
      last = Date.now();
      inFlight.current = true;
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 30_000);
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
