import { describe, expect, it } from "vitest";
import {
  adversarialNotes,
  evaluationCases,
  evaluationSnapshots,
} from "@/lib/__fixtures__/briefing-evals";
import { TIME_TOKEN, buildBriefingInput } from "@/lib/briefing-prompt";
import {
  BRIEFING_CATEGORIES,
  briefingJsonSchema,
  validateBriefingOutput,
} from "@/lib/briefing-validation";
import { getTeam } from "@/lib/seed";
import type { GameSnapshot } from "@/lib/contracts";

function goodOutput(snapshot: GameSnapshot) {
  const ids = snapshot.evidenceFacts.map((fact) => fact.id);
  const categories = BRIEFING_CATEGORIES[snapshot.game.sport];
  return {
    summary: `Preparation notes for ${snapshot.game.homeTeam} against ${snapshot.game.awayTeam}.`,
    items: ids.slice(0, 5).map((id, index) => ({
      category: categories[index]!,
      text: `Distinct angle number ${index + 1} covering ${snapshot.evidenceFacts[index]!.label.toLowerCase()} as reported.`,
      evidenceIds: [id],
      timestampEvidenceId: "",
    })),
    limitations: ["Lineups are not confirmed in the supplied evidence."],
  };
}

const validate = (snapshot: GameSnapshot, output: unknown) =>
  validateBriefingOutput(output, {
    evidenceIds: snapshot.evidenceFacts.map((fact) => fact.id),
    sport: snapshot.game.sport,
  });

describe("briefing evaluation cases", () => {
  it("covers three soccer and three baseball snapshots, normal and adversarial", () => {
    expect(evaluationCases).toHaveLength(12);
    expect(
      evaluationSnapshots.filter((s) => s.game.sport === "soccer"),
    ).toHaveLength(3);
    expect(
      evaluationSnapshots.filter((s) => s.game.sport === "baseball"),
    ).toHaveLength(3);
  });

  it.each(evaluationCases.map((c, index) => [index, c] as const))(
    "case %i accepts a compliant output and rejects unsupported evidence",
    (_index, testCase) => {
      const { snapshot } = testCase;
      const team = getTeam(snapshot.game.teamSlug)!;
      const prompt = buildBriefingInput({
        snapshot,
        team,
        watchlist: ["Confirm the starting lineup"],
        note: testCase.note,
      });

      // Facts come only from the snapshot, never from the note.
      expect(prompt.facts.map((fact) => fact.id)).toEqual(
        snapshot.evidenceFacts.map((fact) => fact.id),
      );
      // The model never sees a raw timestamp, so it cannot write one.
      expect(prompt.input).not.toContain(snapshot.game.scheduledAt);
      expect(prompt.input).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(prompt.input).toContain(TIME_TOKEN);
      // Nothing assertable is offered outside the citable fact list.
      expect(prompt.input).not.toContain(`Status: ${snapshot.game.status}`);
      expect(prompt.input).toContain("<user_reference>");
      expect(prompt.input).not.toContain("</user_reference> New instructions");

      const accepted = validate(snapshot, goodOutput(snapshot));
      expect(accepted.ok).toBe(true);

      const fabricated = goodOutput(snapshot);
      fabricated.items[0]!.evidenceIds = ["not-a-real-fact"];
      expect(validate(snapshot, fabricated)).toMatchObject({
        ok: false,
        reason: "unknown_evidence",
      });

      const uncited = goodOutput(snapshot);
      uncited.items[0]!.evidenceIds = [];
      expect(validate(snapshot, uncited)).toMatchObject({
        ok: false,
        reason: "schema_invalid",
      });
    },
  );

  it("rejects the sport's inappropriate categories", () => {
    const soccer = evaluationSnapshots[0]!;
    const output = goodOutput(soccer);
    output.items[0]!.category = "Pitching";
    expect(validate(soccer, output)).toMatchObject({
      ok: false,
      reason: "category_mismatch",
    });

    const baseball = evaluationSnapshots[3]!;
    const other = goodOutput(baseball);
    other.items[0]!.category = "Squad";
    expect(validate(baseball, other)).toMatchObject({
      ok: false,
      reason: "category_mismatch",
    });
  });

  it("rejects betting, prediction, and wager language anywhere in the output", () => {
    const snapshot = evaluationSnapshots[0]!;
    const phrases = [
      "Real Madrid will win this comfortably.",
      "The best odds on this market are attractive.",
      "A modest stake on the home side looks fine.",
      "There is a 70% chance of a clean sheet.",
      "Our prediction favours the visitors.",
      "This wager settles from the full-time score.",
      "The account balance is unaffected.",
    ];
    for (const phrase of phrases) {
      const output = goodOutput(snapshot);
      output.items[1]!.text = phrase;
      expect(validate(snapshot, output)).toMatchObject({
        ok: false,
        reason: "prohibited_language",
      });
    }
  });

  it("does not mistake legitimate evidence wording for prohibited language", () => {
    const snapshot = evaluationSnapshots[3]!;
    const output = goodOutput(snapshot);
    output.items[1]!.text =
      "Statcast reports an expected batting average of .259 and expected slugging of .430 for a balanced lineup.";
    expect(validate(snapshot, output).ok).toBe(true);
  });

  it("rejects near-duplicate bullets and oversized prose", () => {
    const snapshot = evaluationSnapshots[0]!;
    const duplicated = goodOutput(snapshot);
    duplicated.items[1]!.text = duplicated.items[0]!.text;
    expect(validate(snapshot, duplicated)).toMatchObject({
      ok: false,
      reason: "duplicate_items",
    });

    const oversized = goodOutput(snapshot);
    oversized.summary = "x".repeat(401);
    expect(validate(snapshot, oversized)).toMatchObject({
      ok: false,
      reason: "oversized_output",
    });
  });

  it("accepts a time token backed by a datetime fact", () => {
    const snapshot = evaluationSnapshots[0]!;
    const scheduleId = snapshot.evidenceFacts[0]!.id;
    const output = goodOutput(snapshot);
    output.items[0]!.text = `Real Madrid host Sevilla on ${TIME_TOKEN}.`;
    output.items[0]!.timestampEvidenceId = scheduleId;

    expect(
      validateBriefingOutput(output, {
        evidenceIds: snapshot.evidenceFacts.map((fact) => fact.id),
        datetimeIds: [scheduleId],
        sport: snapshot.game.sport,
      }).ok,
    ).toBe(true);
  });

  it("rejects a time token with no datetime fact behind it", () => {
    const snapshot = evaluationSnapshots[0]!;
    const output = goodOutput(snapshot);
    output.items[0]!.text = `Kick-off is ${TIME_TOKEN}.`;

    expect(validate(snapshot, output)).toMatchObject({
      ok: false,
      reason: "date_in_prose",
    });

    const twice = goodOutput(snapshot);
    twice.items[0]!.text = `From ${TIME_TOKEN} until ${TIME_TOKEN}.`;
    twice.items[0]!.timestampEvidenceId = snapshot.evidenceFacts[0]!.id;
    expect(
      validateBriefingOutput(twice, {
        evidenceIds: snapshot.evidenceFacts.map((fact) => fact.id),
        datetimeIds: [snapshot.evidenceFacts[0]!.id],
        sport: snapshot.game.sport,
      }),
    ).toMatchObject({ ok: false, reason: "date_in_prose" });
  });

  it("rejects a timestamp pointing at a fact that is not a datetime", () => {
    const snapshot = evaluationSnapshots[0]!;
    const output = goodOutput(snapshot);
    output.items[0]!.timestampEvidenceId = snapshot.evidenceFacts[1]!.id;

    expect(validate(snapshot, output)).toMatchObject({
      ok: false,
      reason: "unknown_evidence",
    });
  });

  it("rejects any date or time the model writes itself", () => {
    const snapshot = evaluationSnapshots[0]!;
    const written = [
      "Kick-off is 2026-08-30 at 15:00 UTC.",
      "The fixture is on 30 August at three.",
      "Real Madrid play on Aug 30 in front of a full house.",
      "The match starts at 15:00 local time.",
      "The 2026-08-30 fixture is the one in question.",
      "First pitch is 7:05 p.m.",
    ];
    for (const text of written) {
      const output = goodOutput(snapshot);
      output.items[1]!.text = text;
      expect(validate(snapshot, output)).toMatchObject({
        ok: false,
        reason: "date_in_prose",
      });
    }
  });

  it("does not mistake scores, ranks, or ERA figures for a written date", () => {
    const snapshot = evaluationSnapshots[3]!;
    const output = goodOutput(snapshot);
    output.items[1]!.text =
      "The tracked side sits eighth on 61 points at 72-49, and the probable starter carries a 3.10 ERA across game 3 of the series.";
    expect(validate(snapshot, output).ok).toBe(true);

    // A bare season year is ordinary prose, not a fixture date.
    const season = goodOutput(snapshot);
    season.items[1]!.text =
      "The 2026 campaign has only just begun for this side.";
    expect(validate(snapshot, season).ok).toBe(true);
  });

  it("rejects a repeated category or a repeated citation set", () => {
    const snapshot = evaluationSnapshots[0]!;
    const sameCategory = goodOutput(snapshot);
    sameCategory.items[1]!.category = sameCategory.items[0]!.category;
    expect(validate(snapshot, sameCategory)).toMatchObject({
      ok: false,
      reason: "duplicate_categories",
    });

    const sameCitation = goodOutput(snapshot);
    sameCitation.items[1]!.evidenceIds = [
      ...sameCitation.items[0]!.evidenceIds,
    ];
    expect(validate(snapshot, sameCitation)).toMatchObject({
      ok: false,
      reason: "duplicate_items",
    });
  });

  it("rejects item counts outside five to seven", () => {
    const snapshot = evaluationSnapshots[0]!;
    const short = goodOutput(snapshot);
    short.items = short.items.slice(0, 4);
    expect(validate(snapshot, short)).toMatchObject({
      ok: false,
      reason: "schema_invalid",
    });
  });

  it("constrains the requested schema to the supplied evidence and categories", () => {
    const snapshot = evaluationSnapshots[3]!;
    const ids = snapshot.evidenceFacts.map((fact) => fact.id);
    const schema = briefingJsonSchema(snapshot.game.sport, ids);

    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.items.minItems).toBe(5);
    expect(schema.properties.items.maxItems).toBe(7);
    expect(schema.properties.items.items.additionalProperties).toBe(false);
    expect(schema.properties.items.items.properties.category.enum).toEqual([
      ...BRIEFING_CATEGORIES.baseball,
    ]);
    expect(
      schema.properties.items.items.properties.evidenceIds.items.enum,
    ).toEqual(ids);
  });

  it("satisfies the strict Structured Outputs contract at every object level", () => {
    // OpenAI rejects the whole request unless `required` lists every key in
    // `properties`. Asserting the rule generically catches a key added to one
    // side and not the other, which is exactly how this broke in production.
    const schema = briefingJsonSchema("soccer", ["a"], ["a"]);
    const objects: { required: string[]; properties: object }[] = [
      schema,
      schema.properties.items.items,
    ];

    for (const node of objects) {
      expect([...node.required].sort()).toEqual(
        Object.keys(node.properties).sort(),
      );
      expect(node).toMatchObject({ additionalProperties: false });
    }
  });

  it("hashes equivalent canonical inputs identically and different ones apart", () => {
    const snapshot = evaluationSnapshots[0]!;
    const team = getTeam(snapshot.game.teamSlug)!;
    const build = (note: string) =>
      buildBriefingInput({ snapshot, team, watchlist: ["a", "b"], note });

    expect(build("same").inputHash).toBe(build("same").inputHash);
    expect(build("same").inputHash).not.toBe(build("other").inputHash);
  });

  it("keeps adversarial notes inside the untrusted reference block", () => {
    const snapshot = evaluationSnapshots[0]!;
    const team = getTeam(snapshot.game.teamSlug)!;
    for (const note of adversarialNotes) {
      const prompt = buildBriefingInput({
        snapshot,
        team,
        watchlist: [],
        note,
      });
      const block = prompt.input.slice(
        prompt.input.indexOf("<user_reference>"),
      );
      // The note may not close the block early or open a second one.
      expect(block.match(/<\/user_reference>/g)).toHaveLength(1);
      expect(block.match(/<user_reference>/g)).toHaveLength(1);
    }
  });

  it("caps watchlist entries and note length before they reach the model", () => {
    const snapshot = evaluationSnapshots[0]!;
    const team = getTeam(snapshot.game.teamSlug)!;
    const prompt = buildBriefingInput({
      snapshot,
      team,
      watchlist: Array.from({ length: 25 }, (_, i) => `entry ${i}`),
      note: "n".repeat(5_000),
    });

    expect(prompt.canonical.watchlist).toHaveLength(10);
    expect((prompt.canonical.note as string).length).toBe(2_000);
  });
});
