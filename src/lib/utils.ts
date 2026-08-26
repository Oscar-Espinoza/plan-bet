import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Bumped whenever the published house rules change; frozen into every wager. */
export const RULES_VERSION = "2026-08-21";

/** Session 01 demo route IDs, kept readable so browser-local links still work. */
export function isLegacyBaseballGameId(gameId: string) {
  return /^mlb-(nyy|bos)-\d{2}$/.test(gameId);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A match time the reader can act on: full date, time, and an explicit zone
 * label, all in their own timezone. The zone the match is played in is never
 * shown: neither provider supplies one, and a second clock per fixture was
 * noise — the reader only needs to know when to be ready.
 */
export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
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
