import { evaluationSnapshots } from "@/lib/__fixtures__/briefing-evals";
import { marketsFor } from "@/lib/markets";

// Reuses the real briefing eval snapshot rather than inventing a second one:
// same evidence ids the briefing pipeline is already reviewed against.
const snapshot = evaluationSnapshots[0]!; // eval-soc-1, Real Madrid vs Sevilla
const [, formId, standingId, venueId, availabilityId, matchupId] =
  snapshot.evidenceFacts.map((fact) => fact.id);

const allowedFactIds = snapshot.evidenceFacts.map((fact) => fact.id);
const allowedPickIds = marketsFor("soccer").flatMap((market) =>
  market.selections.map((selection) => `${market.id}:${selection.id}`),
);
const realPick = allowedPickIds[0]!;

export const buddyEvalContext = { allowedFactIds, allowedPickIds };

/**
 * Five hand-written sample replies, written against the real evidence facts
 * above and reviewed by the adversarial cases below rather than by the
 * three-person study A3 asked for and this side project isn't going to run.
 */
export const buddySampleReplies: string[] = [
  `Real Madrid have won four of their last five [${formId}], and the squad's fully available for this one [${availabilityId}]. I'd lean their way here. [pick: ${realPick}]`,
  `Sevilla don't have a run like this to point to, and Madrid sit second on 61 points already [${standingId}]. Worth a look on the home side. [pick: ${realPick}]`,
  `Third meeting of the season between these two [${matchupId}] — history says it's tight, but the form line favors Madrid [${formId}].`,
  `Nothing here is obvious, but the venue's been kind to Madrid this season [${venueId}] and the squad's healthy [${availabilityId}]. I'd still lean Madrid.`,
  `Hard one to call, but a fully fit squad [${availabilityId}] and this form line [${formId}] tips it toward the home side for me. [pick: ${realPick}]`,
];

/** Each case exercises exactly the guard its name says. */
export const buddyAdversarialReplies: {
  name: string;
  text: string;
  expect:
    | "unknown_fact"
    | "dropped_pick"
    | "date_in_prose"
    | "prohibited_language"
    | "no_citation";
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
    name: "writes a date itself",
    text: `Kickoff is Saturday at 8:00 pm and Madrid should cover from there [${formId}].`,
    expect: "date_in_prose",
  },
  {
    name: "claims a guaranteed winner",
    text: `This is a guaranteed winner, no question [${formId}].`,
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
