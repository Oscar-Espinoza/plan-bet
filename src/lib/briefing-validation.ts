import { z } from "zod";
import { TIME_TOKEN } from "@/lib/briefing-prompt";
import type { Sport } from "@/lib/contracts";

const SHARED_CATEGORIES = [
  "Schedule",
  "Form",
  "Standing",
  "Setting",
  "Availability",
  "Matchup",
] as const;

export const BRIEFING_CATEGORIES: Record<Sport, readonly string[]> = {
  soccer: [...SHARED_CATEGORIES, "Squad"],
  baseball: [...SHARED_CATEGORIES, "Pitching", "Batting"],
};

export const MAX_SUMMARY_CHARS = 400;
export const MAX_ITEM_CHARS = 300;
export const MAX_OUTPUT_BYTES = 8_000;
const DUPLICATE_SIMILARITY = 0.8;

/**
 * Language that turns a preparation briefing into tipping or betting advice.
 * Patterns are phrase-anchored on purpose: Statcast evidence legitimately says
 * "expected batting average", and a lineup can legitimately be "balanced", so
 * neither a bare "expected" nor "balanced" may trip these.
 */
const PROHIBITED_PATTERNS = [
  /\b(bet|bets|betting|bettor|wager|wagers|wagering|stake|stakes|odds|moneyline|money line|parlay|accumulator|payout|bookmaker|bookie|bankroll|handicap|point spread)\b/i,
  /\bbalance\b/i,
  /\b(guarantee|guaranteed|sure thing|lock of the (day|week))\b/i,
  /\b(will|should|expects? to|expected to|likely to|projected to|going to|set to)\s+(win|beat|lose|cover|upset)\b/i,
  /\b\d{1,3}\s?%\s*(chance|probability|likely|odds)\b/i,
  /\b(prediction|predictions|predicts?|predicted|forecasts?|tipster|best pick|value pick)\b/i,
];

export const briefingReasonCodes = [
  "schema_invalid",
  "unknown_evidence",
  "item_count",
  "duplicate_items",
  "duplicate_categories",
  "oversized_output",
  "category_mismatch",
  "prohibited_language",
  "date_in_prose",
] as const;
export type BriefingValidationReason = (typeof briefingReasonCodes)[number];

export const aiBriefingOutputSchema = z.object({
  summary: z.string().min(1),
  items: z
    .array(
      z.object({
        category: z.string().min(1),
        text: z.string().min(1),
        evidenceIds: z.array(z.string().min(1)).min(1),
        /** Set when the item refers to a datetime fact; "" means it does not. */
        timestampEvidenceId: z.string(),
      }),
    )
    .min(5)
    .max(7),
  limitations: z.array(z.string().min(1)).min(1),
});
export type AiBriefingOutput = z.infer<typeof aiBriefingOutputSchema>;

/**
 * The strict Structured Outputs schema. Strict mode requires every property to
 * be listed in `required` and forbids additional properties, so there is no
 * room for arbitrary nested objects or tool instructions in the response.
 */
export function briefingJsonSchema(
  sport: Sport,
  evidenceIds: string[],
  datetimeIds: string[] = [],
) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "items", "limitations"],
    properties: {
      summary: { type: "string", maxLength: MAX_SUMMARY_CHARS },
      items: {
        type: "array",
        minItems: 5,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "text", "evidenceIds", "timestampEvidenceId"],
          properties: {
            category: { type: "string", enum: [...BRIEFING_CATEGORIES[sport]] },
            text: { type: "string", maxLength: MAX_ITEM_CHARS },
            evidenceIds: {
              type: "array",
              minItems: 1,
              items: { type: "string", enum: evidenceIds },
            },
            // Strict mode forbids optional keys, so "no timestamp" is the
            // empty string rather than an absent field.
            timestampEvidenceId: { type: "string", enum: ["", ...datetimeIds] },
          },
        },
      },
      limitations: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", maxLength: MAX_ITEM_CHARS },
      },
    },
  } satisfies Record<string, unknown>;
}

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

// ponytail: O(n^2) Jaccard over at most seven bullets. Swap for shingling only
// if the item cap ever grows past a couple of dozen.
function nearDuplicate(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared) >= DUPLICATE_SIMILARITY;
}

export function findProhibitedLanguage(text: string) {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(text));
}

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

/**
 * The reader's browser owns every date and time. These patterns catch a model
 * writing one itself, which would pin the fixture to the wrong timezone. They
 * are anchored so real evidence wording survives: an ERA of "3.10", "Game 3 of
 * the series", and "#8 · 0 pts" must all pass.
 */
const DATE_PATTERNS = [
  /\d{1,2}:\d{2}/,
  /\d{4}-\d{2}-\d{2}/,
  new RegExp(`\\b(${MONTHS})\\b\\.?\\s+\\d{1,2}\\b`, "i"),
  new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(${MONTHS})\\b`, "i"),
  /\b(utc|gmt)\b/i,
  /\b(a\.?m\.?|p\.?m\.?)\b/i,
  // A bare year is deliberately not listed: "the 2026 campaign" is ordinary
  // prose, not a fixture date, and rejecting it starved valid generations.
];

export function findWrittenDate(text: string) {
  const stripped = text.replaceAll(TIME_TOKEN, " ");
  return DATE_PATTERNS.some((pattern) => pattern.test(stripped));
}

export type BriefingValidation =
  | { ok: true; output: AiBriefingOutput }
  | { ok: false; reason: BriefingValidationReason };

export function validateBriefingOutput(
  raw: unknown,
  options: { evidenceIds: string[]; datetimeIds?: string[]; sport: Sport },
): BriefingValidation {
  const parsed = aiBriefingOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "schema_invalid" };
  const output = parsed.data;

  if (
    new TextEncoder().encode(JSON.stringify(output)).byteLength >
    MAX_OUTPUT_BYTES
  ) {
    return { ok: false, reason: "oversized_output" };
  }
  if (output.summary.length > MAX_SUMMARY_CHARS) {
    return { ok: false, reason: "oversized_output" };
  }
  if (output.items.some((item) => item.text.length > MAX_ITEM_CHARS)) {
    return { ok: false, reason: "oversized_output" };
  }

  if (output.items.some((item) => item.evidenceIds.length === 0)) {
    return { ok: false, reason: "item_count" };
  }

  const allowed = new Set(options.evidenceIds);
  const cited = output.items.flatMap((item) => item.evidenceIds);
  if (cited.some((id) => !allowed.has(id))) {
    return { ok: false, reason: "unknown_evidence" };
  }

  // A time slot may only point at a fact whose value really is a datetime.
  const datetimes = new Set(options.datetimeIds ?? []);
  for (const item of output.items) {
    const id = item.timestampEvidenceId;
    if (id && !datetimes.has(id))
      return { ok: false, reason: "unknown_evidence" };
    const tokens = item.text.split(TIME_TOKEN).length - 1;
    if (tokens > 1) return { ok: false, reason: "date_in_prose" };
    if (tokens === 1 && !id) return { ok: false, reason: "date_in_prose" };
  }

  const categories = new Set(BRIEFING_CATEGORIES[options.sport]);
  if (output.items.some((item) => !categories.has(item.category))) {
    return { ok: false, reason: "category_mismatch" };
  }
  const usedCategories = output.items.map((item) => item.category);
  if (new Set(usedCategories).size !== usedCategories.length) {
    return { ok: false, reason: "duplicate_categories" };
  }

  const texts = output.items.map((item) => item.text);
  const citationSets = output.items.map((item) =>
    [...item.evidenceIds].sort().join("|"),
  );
  if (new Set(citationSets).size !== citationSets.length) {
    return { ok: false, reason: "duplicate_items" };
  }
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      if (nearDuplicate(texts[i]!, texts[j]!)) {
        return { ok: false, reason: "duplicate_items" };
      }
    }
  }

  const prose = [output.summary, ...texts, ...output.limitations].join(" ");
  if (findProhibitedLanguage(prose)) {
    return { ok: false, reason: "prohibited_language" };
  }
  if (findWrittenDate(prose)) {
    return { ok: false, reason: "date_in_prose" };
  }

  return { ok: true, output };
}
