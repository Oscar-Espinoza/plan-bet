/** A chat turn, not a report — the briefing's 8,000-byte cap would be absurd here. */
export const MAX_REPLY_CHARS = 700;

/**
 * Narrower than the briefing's ban: the buddy is allowed to lean and predict,
 * CLAUDE.md's rule change is what permits that. What it may never do is talk
 * like a sportsbook, invent a number it has no basis for, or turn on the
 * reader personally.
 *
 * ponytail: the identity-insult list below is a short set of the clearest
 * slurs, not a moderation model — expand the list or swap in a moderation
 * API if this proves too narrow.
 */
const BUDDY_PROHIBITED_PATTERNS = [
  /\b(real money|deposit|deposits|withdraw|withdrawal|withdrawals)\b/i,
  /\b(bookmaker|bookie|sportsbook|betting site)\b/i,
  /\b(guarantee|guaranteed|\block\b|sure thing)\b/i,
  /\d{1,3}\s?%/,
  /\bprobability\b/i,
  // Mocking the pick is the job; mocking the person never is.
  /\b(you'?re|you are|ur)\s+(an?\s+)?(idiot|moron|stupid|dumb|pathetic|loser|trash|worthless|retard(ed)?)\b/i,
  /\b(retard(ed)?|f[a4]gg?ot|sp[i1]c|k[i1]ke|ch[i1]nk|n[i1]gg?(er|a)|tr[a4]nn(y|ie)|wetback)\b/i,
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
] as const;
export type BuddyReplyReason = (typeof buddyReasonCodes)[number];

export type BuddyReplyParse =
  | {
      ok: true;
      prose: string;
      factIds: string[];
      pickId?: string;
      note?: string;
      draft?: string;
    }
  | { ok: false; reason: BuddyReplyReason };

// Fact markers are bare ids in brackets ("[abc-1]"); the pick, draft, and
// note markers are distinguished by their prefix. Text order runs
// ... [pick: ...] [draft: ...] [note: ...] — the note trails everything
// (it's a note-to-self about the reader, never part of the pick or the
// take), the draft trails the pick (it's the line the pick prompted), so
// stripping runs note first, then draft, then pick, and none of the three
// can parse as a stray fact citation.
const PICK_MARKER = /\s*\[pick:\s*([a-zA-Z0-9_:-]+)\]\s*$/i;
// Unlike NOTE_MARKER, this one allows brackets inside the captured text
// (greedy up to the last "]") — a draft, unlike a note, can plausibly carry
// a stray fact citation the model meant for the prose, and it still has to
// come out of the draft text below.
const DRAFT_MARKER = /\s*\[draft:\s*([\s\S]*)\]\s*$/i;
const NOTE_MARKER = /\s*\[note:\s*([^[\]]*)\]\s*$/i;
const FACT_MARKER = /\[([a-zA-Z0-9_-]+)\]/g;
const MAX_NOTE_CHARS = 120;
// Same cap gameCommentRequestSchema enforces on a real posted comment — the
// draft has to fit the textarea it's headed for.
export const MAX_DRAFT_CHARS = 280;

export function parseBuddyReply(
  text: string,
  options: { allowedFactIds: string[]; allowedPickIds: string[] },
): BuddyReplyParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (new TextEncoder().encode(trimmed).byteLength > MAX_REPLY_CHARS) {
    return { ok: false, reason: "oversized" };
  }

  const noteMatch = trimmed.match(NOTE_MARKER);
  const withoutNote = noteMatch
    ? trimmed.slice(0, noteMatch.index).trim()
    : trimmed;
  // A blank or malformed marker is dropped silently — it's a bonus, never a
  // reason to reject an otherwise fine reply.
  const rawNote = noteMatch?.[1]?.trim();
  const note = rawNote ? rawNote.slice(0, MAX_NOTE_CHARS) : undefined;

  const draftMatch = withoutNote.match(DRAFT_MARKER);
  const withoutDraft = draftMatch
    ? withoutNote.slice(0, draftMatch.index).trim()
    : withoutNote;
  // A blank or malformed draft is dropped silently too — same contract as
  // the note. Fact markers are stripped out of the draft text itself, and
  // it's removed from the reply here, before factIds is ever computed below
  // — so a bracket can never reach the textarea and a citation buried in a
  // draft can never satisfy `no_citation`.
  const rawDraft = draftMatch?.[1]?.trim();
  const draft = rawDraft
    ? rawDraft
        .replace(FACT_MARKER, "")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, MAX_DRAFT_CHARS)
    : undefined;

  const pickMatch = withoutDraft.match(PICK_MARKER);
  const withoutPick = pickMatch
    ? withoutDraft.slice(0, pickMatch.index).trim()
    : withoutDraft;
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

  // A draft is destined for a public thread, so a slur in it retracts the
  // whole reply — it does not quietly drop just the draft the way a
  // malformed marker does.
  if (
    findBuddyProhibitedLanguage(withoutPick) ||
    (draft && findBuddyProhibitedLanguage(draft))
  ) {
    return { ok: false, reason: "prohibited_language" };
  }

  // The markers are the proof the reply is grounded, not part of the voice
  // — factIds above already carries them into the audit trail, so the
  // reader never has to see a bracket.
  const prose = withoutPick
    .replace(FACT_MARKER, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { ok: true, prose, factIds, pickId, note, draft };
}
