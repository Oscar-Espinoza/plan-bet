"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Countdown } from "@/components/local-date-time";

type RibbonArea = "clock" | "returns" | "action" | "feedback";
export const RibbonContext = createContext<
  Record<RibbonArea, HTMLElement | null>
>({
  clock: null,
  returns: null,
  action: null,
  feedback: null,
});

/** Targets belong to the shell; content and state belong to the route. React
 * removes each portal on unmount, including sport-filter and route changes. */
export function RibbonPortal({
  area,
  children,
  fallback = true,
}: {
  area: RibbonArea;
  children: ReactNode;
  fallback?: boolean;
}) {
  const target = useContext(RibbonContext)[area];
  return target ? createPortal(children, target) : fallback ? children : null;
}

export function BoardClock({ value }: { value: string }) {
  return (
    <RibbonPortal area="clock" fallback={false}>
      <span className="ribbon-label">Kickoff in</span>
      <span className="ribbon-countdown">
        <Countdown value={value} />
      </span>
    </RibbonPortal>
  );
}

/** Observe the actual bands, including wrapping text, zoom and safe areas.
 * Ref cleanup resets a removed tour; display:none reports zero for desktop nav. */
export function useBandHeight(variable: "--nav-h" | "--ribbon-h" | "--tour-h") {
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
