import { describe, expect, it } from "vitest";
import { commentPhase, pickPins } from "@/data/game-comments";
import type { GameComment } from "@/lib/contracts";

function comment(
  overrides: Partial<GameComment> & { id: string },
): GameComment {
  return {
    groupId: "group-1",
    userId: "user-1",
    authorName: "A member",
    authorSelectionLabel: "Home",
    phase: "before",
    body: "take",
    createdAt: "2026-01-01T00:00:00.000Z",
    shameVotes: 0,
    slanderVotes: 0,
    viewerVoted: [],
    ...overrides,
  };
}

describe("pickPins", () => {
  it("picks the comment with the most votes of each kind", () => {
    const comments = [
      comment({ id: "a", shameVotes: 1, slanderVotes: 0 }),
      comment({ id: "b", shameVotes: 2, slanderVotes: 3 }),
    ];
    expect(pickPins(comments)).toEqual({ shame: "b", slander: "b" });
  });

  it("gives no pin at zero votes", () => {
    const comments = [comment({ id: "a", shameVotes: 0, slanderVotes: 0 })];
    expect(pickPins(comments)).toEqual({
      shame: undefined,
      slander: undefined,
    });
  });

  it("resolves a tie to whichever comment arrived earliest — comments are ordered createdAt asc", () => {
    const comments = [
      comment({ id: "earlier", shameVotes: 2 }),
      comment({ id: "later", shameVotes: 2 }),
    ];
    expect(pickPins(comments).shame).toBe("earlier");
  });

  it("re-derives the pin once a leading comment's votes are stripped away", () => {
    const withA = [
      comment({ id: "a", shameVotes: 2 }),
      comment({ id: "b", shameVotes: 1 }),
    ];
    expect(pickPins(withA).shame).toBe("a");

    const aStripped = [
      comment({ id: "a", shameVotes: 0 }),
      comment({ id: "b", shameVotes: 1 }),
    ];
    expect(pickPins(aStripped).shame).toBe("b");
  });
});

describe("commentPhase", () => {
  const kickoff = "2026-08-24T19:00:00.000Z";
  it("permits the first message strictly before kickoff", () => {
    expect(
      commentPhase(kickoff, new Date("2026-08-24T18:59:59Z"), "scheduled"),
    ).toBe("before");
    expect(commentPhase(kickoff, new Date(kickoff), "scheduled")).toBeNull();
  });
  it("requires confirmed full time for the second message", () => {
    expect(
      commentPhase(kickoff, new Date("2026-08-25T00:00:00Z"), "live"),
    ).toBeNull();
    expect(
      commentPhase(kickoff, new Date("2026-08-25T00:00:00Z"), "finished"),
    ).toBe("after");
  });
  it.each(["cancelled", "postponed", "unknown"] as const)(
    "closes posting for %s",
    (status) => {
      expect(
        commentPhase(kickoff, new Date("2026-08-24T18:00:00Z"), status),
      ).toBeNull();
    },
  );
});
