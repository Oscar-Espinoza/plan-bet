"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import type { CommentVoteKind, GameComment } from "@/lib/contracts";
import { useMatchdayStore } from "@/lib/store";

const VOTE_LABEL: Record<CommentVoteKind, string> = {
  shame: "Shame",
  slander: "Slander",
};

// Whether the viewer has already commented for the *current* phase is
// derived server-side (same clock `postComment` re-derives on write) and
// shipped as this one flag, so the client never does its own kickoff math.
// `viewerSelectionLabel` is the viewer's own side in this group, so a vote
// button never appears on a comment the viewer isn't eligible to vote on —
// `castVote` re-derives the same cross-side rule regardless.
export type CommentThreadView = {
  groupId: string;
  groupName: string;
  comments: GameComment[];
  hasCommented: boolean;
  viewerSelectionLabel: string | null;
  pins: { shame?: string; slander?: string };
};

function pinCaption(
  comments: GameComment[],
  commentId: string | undefined,
  label: string,
) {
  if (!commentId) return null;
  const comment = comments.find((c) => c.id === commentId);
  return (
    <p className="field-label">
      {label}: {comment?.authorName ?? "A member"}
    </p>
  );
}

/** One block per eligible group, rendered by `BetSlip` below the picks. */
export function GameThread({
  routeId,
  thread,
}: {
  routeId: string;
  thread: CommentThreadView;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [votePending, setVotePending] = useState("");
  const [voteError, setVoteError] = useState("");
  const fieldId = `comment-${thread.groupId}`;

  // The dialog is an overlay over this same page, so the thread is already
  // mounted when a draft lands — the group id gate is what stops a draft
  // meant for one thread from filling in a different one on the same page.
  // Filling the textarea is adjusted during render (React's own pattern for
  // syncing local state to a changed external value, rather than a render
  // behind it in an effect); clearing the draft from the store is the one
  // real side effect, so that alone runs in an effect.
  const commentDraft = useMatchdayStore((state) => state.commentDraft);
  const clearCommentDraft = useMatchdayStore(
    (state) => state.clearCommentDraft,
  );
  const matchingDraft =
    commentDraft?.groupId === thread.groupId ? commentDraft : undefined;
  // Compared by reference, not by text: `draftComment` mints a fresh object
  // every time, so asking for the same line twice — after typing over the
  // box — still refills it, which comparing the text would silently skip.
  const [consumedDraft, setConsumedDraft] = useState<object | undefined>(
    undefined,
  );
  if (matchingDraft && matchingDraft !== consumedDraft) {
    setConsumedDraft(matchingDraft);
    setBody(matchingDraft.text);
  }
  useEffect(() => {
    if (matchingDraft) clearCommentDraft();
  }, [matchingDraft, clearCommentDraft]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(`/api/games/${routeId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: thread.groupId, body }),
    }).catch(() => null);
    setPending(false);

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setError(text || "The comment did not go through. Try again.");
      return;
    }

    setBody("");
    router.refresh();
  };

  const vote = async (commentId: string, kind: CommentVoteKind) => {
    const key = `${commentId}:${kind}`;
    setVotePending(key);
    setVoteError("");
    const response = await fetch(`/api/comments/${commentId}/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch(() => null);
    setVotePending("");

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      setVoteError(text || "The vote did not go through. Try again.");
      return;
    }

    router.refresh();
  };

  return (
    <div className="side-form">
      <h3 className="field-label">{thread.groupName}</h3>
      {pinCaption(thread.comments, thread.pins.shame, "Pin of shame")}
      {pinCaption(thread.comments, thread.pins.slander, "Best slander")}
      {thread.comments.map((comment) => {
        // The one rule this feature enforces: you may only pin a comment
        // from a wager on the other side of yours in this group.
        // `castVote` re-derives this on write regardless of what renders.
        const sameSide =
          thread.viewerSelectionLabel !== null &&
          comment.authorSelectionLabel === thread.viewerSelectionLabel;
        return (
          <p className="fine-print" key={comment.id}>
            {comment.authorName ?? "A member"} · {comment.authorSelectionLabel}{" "}
            · {comment.phase} — {comment.body}
            {!sameSide &&
              (["shame", "slander"] as const).map((kind) => {
                const votes =
                  kind === "shame" ? comment.shameVotes : comment.slanderVotes;
                return (
                  <Button
                    key={kind}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={
                      votePending === `${comment.id}:${kind}` ||
                      comment.viewerVoted.includes(kind)
                    }
                    onClick={() => vote(comment.id, kind)}
                  >
                    {`${VOTE_LABEL[kind]} (${votes})`}
                  </Button>
                );
              })}
          </p>
        );
      })}
      {voteError && (
        <Banner tone="negative" role="alert">
          {voteError}
        </Banner>
      )}
      {thread.hasCommented ? (
        <p className="fine-print">
          You&rsquo;ve already commented for this side of kickoff.
        </p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor={fieldId} className="field-label">
            Say something
          </label>
          <textarea
            id={fieldId}
            className="field"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={280}
            required
          />
          {error && (
            <Banner tone="negative" role="alert">
              {error}
            </Banner>
          )}
          <Button type="submit" size="sm" disabled={pending || !body.trim()}>
            Post
          </Button>
        </form>
      )}
    </div>
  );
}
