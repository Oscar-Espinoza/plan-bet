import { describe, expect, it } from "vitest";
import {
  buddyAdversarialReplies,
  buddyEvalContext,
  buddySampleReplies,
} from "@/lib/__fixtures__/buddy-evals";
import { parseBuddyReply } from "@/lib/buddy-validation";

describe("parseBuddyReply", () => {
  it.each(buddySampleReplies)("accepts a grounded sample reply", (text) => {
    const result = parseBuddyReply(text, buddyEvalContext);
    expect(result.ok).toBe(true);
  });

  it.each(buddyAdversarialReplies)("$name", ({ text, expect: expected }) => {
    const result = parseBuddyReply(text, buddyEvalContext);
    if (expected === "dropped_pick") {
      expect(result).toMatchObject({ ok: true, pickId: undefined });
    } else {
      expect(result).toMatchObject({ ok: false, reason: expected });
    }
  });

  it("rejects an empty reply", () => {
    expect(parseBuddyReply("   ", buddyEvalContext)).toMatchObject({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a reply over the byte cap", () => {
    const huge = `Madrid all day [${buddyEvalContext.allowedFactIds[0]}] ${"x".repeat(800)}`;
    expect(parseBuddyReply(huge, buddyEvalContext)).toMatchObject({
      ok: false,
      reason: "oversized",
    });
  });

  it("allows an uncited reply only when no facts exist for the page", () => {
    const result = parseBuddyReply("I've got nothing to go on here.", {
      allowedFactIds: [],
      allowedPickIds: [],
    });
    expect(result).toMatchObject({ ok: true, factIds: [] });
  });

  it("strips fact markers from prose but keeps them in factIds", () => {
    const id = buddyEvalContext.allowedFactIds[0]!;
    const result = parseBuddyReply(`Madrid, easy [${id}].`, buddyEvalContext);
    expect(result).toMatchObject({
      ok: true,
      prose: "Madrid, easy.",
      factIds: [id],
    });
  });

  it("extracts a trailing note marker and strips it from prose", () => {
    const id = buddyEvalContext.allowedFactIds[0]!;
    const result = parseBuddyReply(
      `Madrid, easy [${id}]. [note: swears a lot, root for Madrid]`,
      buddyEvalContext,
    );
    expect(result).toMatchObject({
      ok: true,
      prose: "Madrid, easy.",
      note: "swears a lot, root for Madrid",
    });
  });

  it("extracts a trailing draft marker and strips it from prose", () => {
    const id = buddyEvalContext.allowedFactIds[0]!;
    const result = parseBuddyReply(
      `Madrid, easy [${id}]. [draft: Madrid takes this walking]`,
      buddyEvalContext,
    );
    expect(result).toMatchObject({
      ok: true,
      prose: "Madrid, easy.",
      draft: "Madrid takes this walking",
    });
  });

  it("drops a missing or malformed draft silently, without rejecting the reply", () => {
    const id = buddyEvalContext.allowedFactIds[0]!;
    const noDraft = parseBuddyReply(`Madrid, easy [${id}].`, buddyEvalContext);
    expect(noDraft).toMatchObject({ ok: true, draft: undefined });

    const blank = parseBuddyReply(
      `Madrid, easy [${id}]. [draft: ]`,
      buddyEvalContext,
    );
    expect(blank).toMatchObject({ ok: true, draft: undefined });
  });

  it("truncates a draft over the 280-character cap rather than rejecting the reply", () => {
    const id = buddyEvalContext.allowedFactIds[0]!;
    const long = "x".repeat(400);
    const result = parseBuddyReply(
      `Madrid, easy [${id}]. [draft: ${long}]`,
      buddyEvalContext,
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.draft).toHaveLength(280);
    }
  });

  it("strips fact markers out of the draft text so a citation never reaches the textarea", () => {
    const id = buddyEvalContext.allowedFactIds[0]!;
    const result = parseBuddyReply(
      `Madrid, easy [${id}]. [draft: Madrid all day [${id}]]`,
      buddyEvalContext,
    );
    expect(result).toMatchObject({ ok: true, draft: "Madrid all day" });
  });

  it("retracts the whole reply when the draft itself carries prohibited language", () => {
    const id = buddyEvalContext.allowedFactIds[0]!;
    const result = parseBuddyReply(
      `Madrid, easy [${id}]. [draft: this is a guaranteed win]`,
      buddyEvalContext,
    );
    expect(result).toMatchObject({ ok: false, reason: "prohibited_language" });
  });
});
