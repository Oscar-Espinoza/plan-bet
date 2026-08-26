"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime, formatShortDate } from "@/lib/utils";

/**
 * True only once the browser owns the render.
 *
 * These components format in the reader's own zone, which the server cannot
 * know. The previous attempt formatted on the server too and papered the
 * difference over with `suppressHydrationWarning` — but that flag silences the
 * mismatch without repairing it: React keeps the server text in the DOM while
 * memoizing the client string, so no later render ever diffs unequal and the
 * whole page stayed frozen in the server's zone (UTC on Vercel). Rendering
 * nothing until hydration means the server and hydration renders agree, and the
 * first client render is a genuine change React patches. The reader is never
 * shown a time in a zone that isn't theirs.
 */
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function LocalDateTime({
  value,
  short = false,
}: {
  value: string;
  short?: boolean;
}) {
  const hydrated = useHydrated();
  return (
    <time dateTime={value}>
      {hydrated && (short ? formatShortDate(value) : formatDateTime(value))}
    </time>
  );
}

/** The slate's one urgency signal: "in 40m" / "in 3h" / "in 9d" / "Started". */
function relativeKickoffLabel(value: string) {
  const diffMs = new Date(value).getTime() - Date.now();
  if (diffMs <= 0) return "Started";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function RelativeKickoff({ value }: { value: string }) {
  const hydrated = useHydrated();
  return (
    <time dateTime={value}>{hydrated && relativeKickoffLabel(value)}</time>
  );
}

function clockAt(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

/** The slate row's fixed mono time column — just the clock, no date. The day
 * group heading above the row already carries the date. */
export function KickoffTime({ value }: { value: string }) {
  const hydrated = useHydrated();
  return <time dateTime={value}>{hydrated && clockAt(value)}</time>;
}

/** Names the zone every unlabelled time on the page is in, once. */
export function TimezoneLegend() {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  if (!zone) return null;
  return (
    <p className="slate-tz">
      All times <span>{zone}</span> · your time
    </p>
  );
}
