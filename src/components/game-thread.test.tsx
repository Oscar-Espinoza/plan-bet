import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { GameThread, type CommentThreadView } from "@/components/game-thread";
import type { GameComment } from "@/lib/contracts";
import { useMatchdayStore } from "@/lib/store";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

afterEach(() => {
  cleanup();
  // A leftover draft from one test must never leak into the next.
  useMatchdayStore.setState({ commentDraft: undefined });
});

function thread(overrides: Partial<CommentThreadView> = {}): CommentThreadView {
  return {
    groupId: "group-1",
    groupName: "Sunday League",
    comments: [],
    hasCommented: false,
    viewerSelectionLabel: null,
    pins: {},
    ...overrides,
  };
}

function comment(
  overrides: Partial<GameComment> & { id: string },
): GameComment {
  return {
    groupId: "group-1",
    userId: "user-1",
    authorName: "Dani",
    authorSelectionLabel: "Home",
    phase: "before",
    body: "Taking the over",
    createdAt: "2026-01-01T00:00:00.000Z",
    shameVotes: 0,
    slanderVotes: 0,
    viewerVoted: [],
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
            comment({ id: "comment-1", phase: "after", body: "Called it" }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Called it", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Dani", { exact: false })).toBeInTheDocument();
  });

  it("falls back to a generic name when the author has none on file", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({
          comments: [comment({ id: "comment-1", authorName: null })],
        })}
      />,
    );

    expect(screen.getByText("A member", { exact: false })).toBeInTheDocument();
  });

  it("shows vote counts for a comment from the other side", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({
          viewerSelectionLabel: "Home",
          comments: [
            comment({
              id: "comment-1",
              authorSelectionLabel: "Away",
              shameVotes: 2,
              slanderVotes: 1,
            }),
          ],
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Shame (2)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Slander (1)" }),
    ).toBeInTheDocument();
  });

  it("hides the vote buttons entirely when the viewer is on the same side as the author", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({
          viewerSelectionLabel: "Home",
          comments: [
            comment({ id: "comment-1", authorSelectionLabel: "Home" }),
          ],
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Shame/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Slander/ }),
    ).not.toBeInTheDocument();
  });

  it("disables only the vote the viewer has already cast, on that one comment", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({
          viewerSelectionLabel: "Home",
          comments: [
            comment({
              id: "comment-1",
              authorSelectionLabel: "Away",
              viewerVoted: ["shame"],
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Shame (0)" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Slander (0)" }),
    ).not.toBeDisabled();
  });

  it("shows a pin caption naming the pinned comment's author, once a pin exists", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({
          viewerSelectionLabel: "Home",
          pins: { shame: "comment-1" },
          comments: [
            comment({
              id: "comment-1",
              authorName: "Dani",
              authorSelectionLabel: "Away",
              shameVotes: 3,
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Pin of shame: Dani")).toBeInTheDocument();
    expect(screen.queryByText(/Best slander/)).not.toBeInTheDocument();
  });

  it("prefills the textarea from a matching buddy draft and clears it", () => {
    useMatchdayStore.setState({
      commentDraft: { groupId: "group-1", text: "Their pick is soft" },
    });
    render(<GameThread routeId="soc-rma-01" thread={thread()} />);

    expect(screen.getByLabelText("Say something")).toHaveValue(
      "Their pick is soft",
    );
    expect(useMatchdayStore.getState().commentDraft).toBeUndefined();
  });

  it("refills the textarea when the same line is drafted again", () => {
    const { draftComment } = useMatchdayStore.getState();
    draftComment("group-1", "Their pick is soft");
    render(<GameThread routeId="soc-rma-01" thread={thread()} />);

    const field = screen.getByLabelText("Say something");
    fireEvent.change(field, { target: { value: "" } });
    expect(field).toHaveValue("");

    // A fresh object each time, so byte-identical text still lands — the
    // reader who typed over the box can ask for the same line back.
    act(() => draftComment("group-1", "Their pick is soft"));
    expect(field).toHaveValue("Their pick is soft");
  });

  it("ignores a draft whose groupId belongs to another thread", () => {
    useMatchdayStore.setState({
      commentDraft: { groupId: "group-2", text: "Their pick is soft" },
    });
    render(<GameThread routeId="soc-rma-01" thread={thread()} />);

    expect(screen.getByLabelText("Say something")).toHaveValue("");
    expect(useMatchdayStore.getState().commentDraft).toEqual({
      groupId: "group-2",
      text: "Their pick is soft",
    });
  });
});
