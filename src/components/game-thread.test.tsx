import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  screen,
} from "@testing-library/react";
import { GameThread, type CommentThreadView } from "@/components/game-thread";
import { LanguageProvider } from "./language-provider";
import type { GameComment } from "@/lib/contracts";
import { useMatchdayStore } from "@/lib/store";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // A leftover draft from one test must never leak into the next.
  useMatchdayStore.setState({ commentDraft: undefined });
});

function thread(overrides: Partial<CommentThreadView> = {}): CommentThreadView {
  return {
    groupId: "group-1",
    groupName: "Sunday League",
    comments: [],
    hasCommented: false,
    postingPhase: "before",
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
      screen.getByText("You have already used your message for this phase."),
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

    expect(screen.getByText("Pin of shame")).toBeInTheDocument();
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

describe("two-level discussion", () => {
  const root = comment({
    id: "11111111-1111-4111-8111-111111111111",
    body: "First take",
  });
  const reply = comment({
    id: "22222222-2222-4222-8222-222222222222",
    parentCommentId: root.id,
    body: "My reply",
    phase: "after",
    authorName: "Ana",
  });
  it("collapses replies, shows the author and phase, and retains expansion and drafts after refresh", () => {
    const props = thread({ comments: [root, reply] });
    const view = render(<GameThread routeId="soc-rma-01" thread={props} />);
    expect(screen.getByText("First take")).toBeVisible();
    expect(screen.getByText("My reply")).not.toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Show all comments (1)" }),
    );
    expect(screen.getByText("My reply")).toBeVisible();
    expect(screen.getByText("After full time")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Say something"), {
      target: { value: "A draft" },
    });
    view.rerender(<GameThread routeId="soc-rma-01" thread={{ ...props }} />);
    expect(screen.getByLabelText("Say something")).toHaveValue("A draft");
    expect(screen.getByText("My reply")).toBeVisible();
  });
  it("sends the selected target, preserves failed drafts, and consumes the phase slot on success", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Try again" } }), {
          status: 500,
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({ comments: [root], postingPhase: "after" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Replying to Dani")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Say something"), {
      target: { value: "My response" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Try again"),
    );
    expect(screen.getByLabelText("Say something")).toHaveValue("My response");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
      groupId: "group-1",
      body: "My response",
      parentCommentId: root.id,
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("You have already used your message for this phase."),
    ).toBeVisible();
  });
  it("disables new messages and replies while the game is in progress", () => {
    render(
      <GameThread
        routeId="soc-rma-01"
        thread={thread({ comments: [root], postingPhase: null })}
      />,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reply" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("after full time");
  });
});

it("keeps a reply draft and expanded thread when switching language, and cancel keeps the text", () => {
  const root = comment({ id: "root", body: "Root" });
  const props = thread({
    comments: [
      root,
      comment({ id: "reply", parentCommentId: "root", body: "Reply text" }),
    ],
  });
  const view = render(
    <LanguageProvider locale="en">
      <GameThread routeId="game" thread={props} />
    </LanguageProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Show all comments (1)" }),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]!);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "My draft" },
  });
  view.rerender(
    <LanguageProvider locale="es">
      <GameThread routeId="game" thread={props} />
    </LanguageProvider>,
  );
  expect(screen.getByRole("textbox")).toHaveValue("My draft");
  expect(screen.getByText("Reply text")).toBeVisible();
  expect(screen.getByText("Respondiendo a Dani")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar respuesta" }));
  expect(screen.queryByText("Respondiendo a Dani")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("My draft");
});

it("updates vote counts immediately and rolls back a rejected vote", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(
    <GameThread
      routeId="game"
      thread={thread({
        viewerSelectionLabel: "Home",
        comments: [comment({ id: "opponent", authorSelectionLabel: "Away" })],
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Shame (0)" }));
  expect(screen.getByRole("button", { name: "Shame (1)" })).toBeDisabled();
  await act(async () =>
    finish(
      new Response(JSON.stringify({ error: { message: "Vote rejected" } }), {
        status: 403,
      }),
    ),
  );
  expect(screen.getByRole("button", { name: "Shame (0)" })).toBeEnabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Vote rejected");
});

it("shows a pending comment immediately and keeps its draft after failure", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(<GameThread routeId="game" thread={thread()} />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "My immediate comment" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));
  expect(screen.getByRole("status")).toHaveTextContent("My immediate comment");
  await act(async () => finish(new Response("{}", { status: 500 })));
  expect(screen.getByRole("textbox")).toHaveValue("My immediate comment");
  expect(screen.queryByText(/My immediate comment —/)).not.toBeInTheDocument();
});
