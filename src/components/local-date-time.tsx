"use client";
import { useTranslation } from "@/components/language-provider";

import { intlLocale } from "@/lib/locale";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { formatDateTime, formatShortDate } from "@/lib/utils";

/**
 * True only once the browser owns the render: false on the server and during
 * hydration, true on the render React schedules right after it, and true
 * straight away for anything mounted by a client navigation.
 */
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

type RequestClock = { zone: string; now: number };
const RequestClockContext = createContext<RequestClock>({
  zone: "UTC",
  now: 0,
});

/**
 * The viewer's zone as the edge geolocated it (`x-vercel-ip-timezone`, UTC
 * elsewhere) and the request's own time, set once in the root layout.
 *
 * Every time on the page renders from these on the server and in the
 * hydration pass, so the two agree and the first paint already shows a real
 * time instead of a blank that pops in once ~240 KB of JS has run. The render
 * after hydration switches to the browser's own zone and clock — a genuine
 * re-render React patches, unlike `suppressHydrationWarning`, which kept the
 * server text frozen in the DOM (the reason these once rendered blank). When
 * the geolocated zone is right, which is almost always, that re-render changes
 * nothing on screen.
 */
export function RequestClockProvider({
  zone,
  now,
  children,
}: RequestClock & { children: React.ReactNode }) {
  return (
    <RequestClockContext.Provider value={{ zone, now }}>
      {children}
    </RequestClockContext.Provider>
  );
}

/** `timeZone: undefined` means the browser's own zone. */
function useClock(): { timeZone?: string; now: () => number } {
  const hydrated = useHydrated();
  const request = useContext(RequestClockContext);
  return hydrated
    ? { timeZone: undefined, now: Date.now }
    : { timeZone: request.zone, now: () => request.now };
}

export function LocalDateTime({
  value,
  short = false,
}: {
  value: string;
  short?: boolean;
}) {
  const { locale } = useTranslation();
  const { timeZone } = useClock();
  return (
    <time dateTime={value}>
      {short
        ? formatShortDate(value, intlLocale(locale), timeZone)
        : formatDateTime(value, intlLocale(locale), timeZone)}
    </time>
  );
}

/** The slate's one urgency signal: "in 40m" / "in 3h" / "in 9d" / "Started". */
function relativeKickoffLabel(value: string, now: number) {
  const diffMs = new Date(value).getTime() - now;
  if (diffMs <= 0) return "Started";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

export function RelativeKickoff({ value }: { value: string }) {
  const { t } = useTranslation();
  const { now } = useClock();
  return <time dateTime={value}>{t(relativeKickoffLabel(value, now()))}</time>;
}

function clockAt(value: string, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(intlLocale(locale === "es" ? "es" : "en"), {
    hour: "numeric",
    hourCycle: locale === "es" ? "h23" : undefined,
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

/** The slate row's fixed mono time column — just the clock, no date. The day
 * group heading above the row already carries the date. */
export function KickoffTime({ value }: { value: string }) {
  const { locale } = useTranslation();
  const { timeZone } = useClock();
  return <time dateTime={value}>{clockAt(value, locale, timeZone)}</time>;
}

/** Names the zone every unlabelled time on the page is in, once. */
export function TimezoneLegend() {
  const { t, locale } = useTranslation();
  const { timeZone } = useClock();
  const zone = new Intl.DateTimeFormat(
    intlLocale(locale === "es" ? "es" : "en"),
    { timeZoneName: "short", timeZone },
  )
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  if (!zone) return null;
  return (
    <p className="slate-tz">
      {t("All times")} <span>{zone}</span> {t("· your time")}{" "}
    </p>
  );
}

/**
 * The scorebug's clock. Ticks once a second inside a day of kickoff, where a
 * running clock is the point; above a day it shows days and hours and the
 * interval is wasted, so it stops there. Until its first tick it counts from
 * the request clock, so the server and hydration renders agree.
 */
export function Countdown({ value }: { value: string }) {
  const { t } = useTranslation();
  const clock = useClock();
  const [ticked, setNow] = useState(0);
  const now = ticked || clock.now();

  useEffect(() => {
    const target = new Date(value).getTime();
    const step = () => setNow(Date.now());
    step();
    const remaining = target - Date.now();
    // Nothing to animate a day out, and nothing left to count once it starts.
    // ponytail: a page left open across the 24h boundary keeps showing days
    // until it is navigated; re-arm on a coarse timer if that ever matters.
    if (remaining <= 0 || remaining >= 86_400_000) return;
    const id = setInterval(step, 1000);
    return () => clearInterval(id);
  }, [value]);

  if (now === 0) return <time dateTime={value} />;

  const remaining = new Date(value).getTime() - now;
  if (remaining <= 0) return <time dateTime={value}>{t("Underway")}</time>;

  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86_400);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <time dateTime={value}>
      {days > 0
        ? `${days}d ${pad(Math.floor((seconds % 86_400) / 3600))}h`
        : `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`}
    </time>
  );
}
