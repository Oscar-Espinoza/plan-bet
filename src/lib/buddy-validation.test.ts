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
});
