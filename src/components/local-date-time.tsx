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
