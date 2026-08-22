"use client";

import { formatDateTime, formatShortDate } from "@/lib/utils";

export function LocalDateTime({
  value,
  short = false,
}: {
  value: string;
  short?: boolean;
}) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {short ? formatShortDate(value) : formatDateTime(value)}
    </time>
  );
}

/** The slate's one urgency signal: "in 40m" / "in 3h" / "in 9d" / "Started".
 * Computed client-side like its sibling above — the server render and the
 * browser's clock can disagree by seconds, which is a text mismatch
 * `suppressHydrationWarning` papers over, not a structural one. */
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
  return (
    <time dateTime={value} suppressHydrationWarning>
      {relativeKickoffLabel(value)}
    </time>
  );
}

/** The slate row's fixed mono time column — just the clock, no date. The day
 * group heading above the row already carries the date. */
export function KickoffTime({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))}
    </time>
  );
}
