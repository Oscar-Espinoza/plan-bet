import { findWrittenDate } from "@/lib/briefing-validation";

/** A chat turn, not a report — the briefing's 8,000-byte cap would be absurd here. */
export const MAX_REPLY_CHARS = 700;

/**
 * Narrower than the briefing's ban: the buddy is allowed to lean and predict,
 * CLAUDE.md's rule change is what permits that. What it may never do is talk
 * like a sportsbook or invent a number it has no basis for.
 */
const BUDDY_PROHIBITED_PATTERNS = [
  /\b(real money|deposit|deposits|withdraw|withdrawal|withdrawals)\b/i,
  /\b(bookmaker|bookie|sportsbook|betting site)\b/i,
  /\b(guarantee|guaranteed|\block\b|sure thing)\b/i,
  /\d{1,3}\s?%/,
  /\bprobability\b/i,
];

export function findBuddyProhibitedLanguage(text: string) {
  return BUDDY_PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}

export const buddyReasonCodes = [
  "empty",
  "oversized",
  "no_citation",
  "unknown_fact",
  "prohibited_language",
  "date_in_prose",
] as const;
export type BuddyReplyReason = (typeof buddyReasonCodes)[number];

export type BuddyReplyParse =
  | { ok: true; prose: string; factIds: string[]; pickId?: string }
  | { ok: false; reason: BuddyReplyReason };

// Fact markers are bare ids in brackets ("[abc-1]"); the pick marker is
// distinguished by its "pick:" prefix and is stripped first so it never
// parses as a stray fact citation.
const PICK_MARKER = /\s*\[pick:\s*([a-zA-Z0-9_:-]+)\]\s*$/i;
const FACT_MARKER = /\[([a-zA-Z0-9_-]+)\]/g;

export function parseBuddyReply(
  text: string,
  options: { allowedFactIds: string[]; allowedPickIds: string[] },
): BuddyReplyParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (new TextEncoder().encode(trimmed).byteLength > MAX_REPLY_CHARS) {
    return { ok: false, reason: "oversized" };
  }

  const pickMatch = trimmed.match(PICK_MARKER);
  const withoutPick = pickMatch
    ? trimmed.slice(0, pickMatch.index).trim()
    : trimmed;
  // An invalid or unoffered pick is dropped, not a rejection of the whole
  // reply — the reply itself may still be a perfectly grounded lean.
  const pickId =
    pickMatch && options.allowedPickIds.includes(pickMatch[1]!)
      ? pickMatch[1]
      : undefined;

  const factIds = [...withoutPick.matchAll(FACT_MARKER)].map((m) => m[1]!);
  if (options.allowedFactIds.length > 0) {
    if (factIds.length === 0) return { ok: false, reason: "no_citation" };
    const allowed = new Set(options.allowedFactIds);
    if (factIds.some((id) => !allowed.has(id))) {
      return { ok: false, reason: "unknown_fact" };
    }
  }

  if (findBuddyProhibitedLanguage(withoutPick)) {
    return { ok: false, reason: "prohibited_language" };
  }
  if (findWrittenDate(withoutPick)) {
    return { ok: false, reason: "date_in_prose" };
  }

  return { ok: true, prose: withoutPick, factIds, pickId };
}
