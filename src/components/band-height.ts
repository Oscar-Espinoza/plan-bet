"use client";

import { useCallback } from "react";

/**
 * Observe the actual bands, including wrapping text, zoom and safe areas.
 * Ref cleanup resets a removed band, and `display: none` reports zero for
 * the desktop nav.
 */
export function useBandHeight(variable: "--nav-h" | "--tour-h") {
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
