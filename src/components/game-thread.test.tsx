import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GameThread, type CommentThreadView } from "@/components/game-thread";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

afterEach(cleanup);

function thread(overrides: Partial<CommentThreadView> = {}): CommentThreadView {
  return {
    groupId: "group-1",
    groupName: "Sunday League",
    comments: [],
    hasCommented: false,
    ...overrides,
  };
}

describe("GameThread", () => {
  it("shows the form when the viewer has not yet commented this phase", () => {
    render(<GameThread routeId="soc-rma-01" thread={thread()} />);

    expect(screen.getByLabelText("Say something")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post" })).toBeInTheDocument();
  });

  it("hides the form and shows a line once the viewer has commented this phase", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({ hasCommented: true })}
      />,
    );

    expect(screen.queryByLabelText("Say something")).not.toBeInTheDocument();
    expect(
      screen.getByText("You’ve already commented for this side of kickoff."),
    ).toBeInTheDocument();
  });

  // The bug this phase fixes: the thread used to live only inside the
  // "open" WagerPanelState, so it vanished the moment a game went closed at
  // kickoff — exactly when the "after" comment is meant to appear.
  it("renders an after-kickoff comment same as any other", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({
          comments: [
            {
              id: "comment-1",
              groupId: "group-1",
              userId: "user-1",
              authorName: "Dani",
              phase: "after",
              body: "Called it",
              createdAt: "2026-01-01T22:00:00.000Z",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Dani · after — Called it")).toBeInTheDocument();
  });

  it("falls back to a generic name when the author has none on file", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({
          comments: [
            {
              id: "comment-1",
              groupId: "group-1",
              userId: "user-1",
              authorName: null,
              phase: "before",
              body: "Taking the over",
              createdAt: "2025-12-30T12:00:00.000Z",
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText("A member · before — Taking the over"),
    ).toBeInTheDocument();
  });
});
