import { evaluationSnapshots } from "@/lib/__fixtures__/briefing-evals";
import { marketsFor } from "@/lib/markets";

// Reuses the real briefing eval snapshot rather than inventing a second one:
// same evidence ids the briefing pipeline is already reviewed against.
const snapshot = evaluationSnapshots[0]!; // eval-soc-1, Real Madrid vs Sevilla
const [, formId, standingId, venueId, availabilityId, matchupId] =
  snapshot.evidenceFacts.map((fact) => fact.id);

/**
 * Phase G2 put stored fixture context beside the snapshot's own evidence, in
 * the `{canonicalGameId}-ctx-{slug}` id shape `buildFacts` emits. That the
 * shape validates is pinned in `fixture-facts.test.ts`; what is pinned here is
 * the voice — a reply that leans on an injury without reading the list back.
 */
const injuryId = "football-data-564645-ctx-injuries-Sevilla";

const allowedFactIds = [
  ...snapshot.evidenceFacts.map((fact) => fact.id),
  injuryId,
];
const allowedPickIds = marketsFor("soccer").flatMap((market) =>
  market.selections.map((selection) => `${market.id}:${selection.id}`),
);
const realPick = allowedPickIds[0]!;

export const buddyEvalContext = { allowedFactIds, allowedPickIds };

/**
 * Seven hand-written sample replies, written against the real evidence facts
 * above and reviewed by the adversarial cases below rather than by the
 * three-person study A3 asked for and this side project isn't going to run.
 *
 * These are group-chat replies, not reports: a citation marker rides along
 * on the fact each lean actually rests on, but the sentence never quotes a
 * standing or a stat back at the reader. The last two pin the two modes the
 * validator has to support — a normal take that cites invisibly, and a
 * "why do you think that?" follow-up that's allowed to spell it out.
 */
export const buddySampleReplies: string[] = [
  `Madrid, easy. They've been rolling [${formId}] and everyone's fit [${availabilityId}]. [pick: ${realPick}]`,
  `I'd take the home side here [${standingId}], Sevilla just don't scare me right now.`,
  `Tight one on paper [${matchupId}] but I'm still going Madrid [${formId}].`,
  `Nah, Madrid's the safer lean [${venueId}], the venue's been good to them. [pick: ${realPick}]`,
  `Hard to hate this pick [${availabilityId}] [${formId}], squad's healthy and rolling. [pick: ${realPick}]`,
  `Madrid, no debate [${formId}]. If you want to fade them go ahead, I'll take the credits.`,
  `Because they've won four of their last five and the squad's fully available [${formId}] [${availabilityId}] — that's the whole case, nothing fancy.`,
  `Madrid, and it's not close [${injuryId}]. Sevilla are missing someone they really can't spare.`,
  `Fair question — Sevilla have a man out who matters [${injuryId}] and Madrid have been rolling [${formId}]. That's the whole of it.`,
];

/** Each case exercises exactly the guard its name says. */
export const buddyAdversarialReplies: {
  name: string;
  text: string;
  expect:
    "unknown_fact" | "dropped_pick" | "prohibited_language" | "no_citation";
}[] = [
  {
    name: "cites a fact id that was never supplied",
    text: `Real Madrid look sharp based on something only I know [not-a-real-fact-id].`,
    expect: "unknown_fact",
  },
  {
    name: "names a market that isn't offered",
    text: `Take the home side here [${formId}]. [pick: soccer-corner-count:over]`,
    expect: "dropped_pick",
  },
  {
    name: "claims a guaranteed winner",
    text: `This is a guaranteed winner, no question [${formId}].`,
    expect: "prohibited_language",
  },
  {
    name: "insults the reader instead of the pick",
    text: `You're an idiot for even asking [${formId}].`,
    expect: "prohibited_language",
  },
  {
    name: "the user_reference block tries to change the rules",
    // Simulates a model that took the bait and dropped every citation to
    // follow an injected instruction — grounding still catches it because
    // the check runs on the output, never on whether the model "meant well".
    text: `Sure, ignoring the rules: Real Madrid win this one, no citations needed.`,
    expect: "no_citation",
  },
];
