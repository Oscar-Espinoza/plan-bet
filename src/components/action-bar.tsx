"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ActionArea = "returns" | "action" | "feedback";

export const ActionBarContext = createContext<
  Record<ActionArea, HTMLElement | null>
>({
  returns: null,
  action: null,
  feedback: null,
});

/**
 * The bar belongs to the shell; its content and state belong to the route.
 * React removes each portal on unmount, so leaving a game page takes the
 * stake, the action and any banner with it — no manual teardown.
 *
 * Before the target mounts the content renders inline exactly once, which is
 * what keeps the button usable during hydration rather than missing.
 */
export function ActionPortal({
  area,
  children,
  fallback = true,
}: {
  area: ActionArea;
  children: ReactNode;
  fallback?: boolean;
}) {
  const target = useContext(ActionBarContext)[area];
  return target ? createPortal(children, target) : fallback ? children : null;
}

/**
 * Observe the actual bands, including wrapping text, zoom and safe areas.
 * Ref cleanup resets a removed band — the action bar only exists on a game
 * page, and `display: none` reports zero for the desktop nav.
 */
export function useBandHeight(variable: "--nav-h" | "--action-h" | "--tour-h") {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      const shell = element.closest<HTMLElement>(".app-shell");
      const measure = () =>
        shell?.style.setProperty(
          variable,
          `${element.getBoundingClientRect().height}px`,
        );
      measure();
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(measure);
      observer?.observe(element);
      return () => {
        observer?.disconnect();
        shell?.style.setProperty(variable, "0px");
      };
    },
    [variable],
  );
}
