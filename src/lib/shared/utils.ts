import { clsx, type ClassValue } from "clsx";

/** Bumped whenever the published house rules change; frozen into every wager. */
export const RULES_VERSION = "2026-09-21";

// Plain clsx: the app's classes are semantic, so there are no conflicting
// utilities for tailwind-merge to resolve — it was 8.6 KB on every page.
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * A match time the reader can act on: full date, time, and an explicit zone
 * label, all in their own timezone. The zone the match is played in is never
 * shown: neither provider supplies one, and a second clock per fixture was
 * noise — the reader only needs to know when to be ready.
 */
/** `value` if it is a time zone Intl accepts; UTC otherwise. */
export function viewerZone(value: string | null | undefined) {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

export function formatDateTime(
  value: string,
  locale?: string,
  timeZone?: string,
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    hourCycle: locale?.startsWith("es") ? "h23" : undefined,
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatShortDate(
  value: string,
  locale?: string,
  timeZone?: string,
) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

/**
 * Maps cited evidence IDs to their `[n]` superscript numbers in a fact list's
 * own order, so a fact keeps the same number across every piece of prose
 * that cites it — the brief and the buddy both render through this.
 */
export function citedRefs(facts: { id: string }[], ids: string[]) {
  return facts
    .map((fact, index) => (ids.includes(fact.id) ? index + 1 : 0))
    .filter(Boolean);
}
