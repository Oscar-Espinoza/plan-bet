import { describe, expect, it } from "vitest";
import { commentPhase } from "@/data/game-comments";

describe("commentPhase", () => {
  const kickoff = "2026-08-24T19:00:00.000Z";

  it("is before while now is earlier than kickoff", () => {
    expect(commentPhase(kickoff, new Date("2026-08-24T18:59:59.000Z"))).toBe(
      "before",
    );
  });

  it("is after from the instant of kickoff on", () => {
    expect(commentPhase(kickoff, new Date(kickoff))).toBe("after");
  });

  it("is after well past kickoff", () => {
    expect(commentPhase(kickoff, new Date("2026-08-25T00:00:00.000Z"))).toBe(
      "after",
    );
  });

  it("accepts a Date for scheduledAt, not only a string", () => {
    expect(
      commentPhase(new Date(kickoff), new Date("2026-08-24T00:00:00.000Z")),
    ).toBe("before");
  });
});
