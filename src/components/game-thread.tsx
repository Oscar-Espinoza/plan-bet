"use client";
import { useTranslation } from "@/components/language-provider";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { LocalDateTime } from "./local-date-time";
import type {
  CommentVoteKind,
  GameComment,
  GameCommentPhase,
} from "@/lib/contracts";
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
  postingPhase: GameCommentPhase | null;
  viewerSelectionLabel: string | null;
  pins: { shame?: string; slander?: string };
};

export function GameThread({
  routeId,
  thread,
  matchup,
}: {
  routeId: string;
  thread: CommentThreadView;
  matchup?: { home: string; away: string };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const composer = useRef<HTMLTextAreaElement>(null);
  const [replyTarget, setReplyTarget] = useState<GameComment>();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [postedPhase, setPostedPhase] = useState<GameCommentPhase>();
  const canPost =
    thread.postingPhase !== null &&
    !thread.hasCommented &&
    postedPhase !== thread.postingPhase;
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [localComments, setLocalComments] = useState<GameComment[]>([]);
  const [optimisticVotes, setOptimisticVotes] = useState<string[]>([]);
  const [pendingBody, setPendingBody] = useState("");
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
    if (!canPost || pending) return;
    setPending(true);
    setPendingBody(body);
    setError("");
    const response = await fetch(`/api/games/${routeId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: thread.groupId,
        body,
        parentCommentId: replyTarget?.id,
      }),
    }).catch(() => null);
    setPending(false);
    setPendingBody("");

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

    const payload = await response.json().catch(() => null);
    // Our own route, validated server-side; only check it is a comment.
    const saved = payload?.data?.comment as GameComment | undefined;
    if (saved?.id && typeof saved.body === "string")
      setLocalComments((current) => [...current, saved]);
    if (replyTarget)
      setExpanded((ids) => [
        ...new Set([...ids, replyTarget.parentCommentId ?? replyTarget.id]),
      ]);
    setPostedPhase(thread.postingPhase ?? undefined);
    setReplyTarget(undefined);
    setBody("");
    router.refresh();
  };

  const vote = async (commentId: string, kind: CommentVoteKind) => {
    const key = `${commentId}:${kind}`;
    if (votePending || optimisticVotes.includes(key)) return;
    setOptimisticVotes((current) => [...current, key]);
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
      setOptimisticVotes((current) => current.filter((value) => value !== key));
      setVoteError(text || "The vote did not go through. Try again.");
      return;
    }

    router.refresh();
  };

  const comments = [
    ...thread.comments,
    ...localComments.filter(
      (local) => !thread.comments.some((comment) => comment.id === local.id),
    ),
  ]
    .map((comment) => {
      const added = (["shame", "slander"] as const).filter(
        (kind) =>
          optimisticVotes.includes(`${comment.id}:${kind}`) &&
          !comment.viewerVoted.includes(kind),
      );
      return {
        ...comment,
        shameVotes: comment.shameVotes + Number(added.includes("shame")),
        slanderVotes: comment.slanderVotes + Number(added.includes("slander")),
        viewerVoted: [...comment.viewerVoted, ...added],
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ids = new Set(comments.map((comment) => comment.id));
  const roots = comments.filter(
    (comment) => !comment.parentCommentId || !ids.has(comment.parentCommentId),
  );
  const teamLabel = (label: string) =>
    matchup && /^(home|away)$/i.test(label)
      ? /^home$/i.test(label)
        ? matchup.home
        : matchup.away
      : t(label);
  const phaseLabel = (phase: GameCommentPhase) =>
    t(phase === "before" ? "Before kickoff" : "After full time");
  const renderComment = (comment: GameComment) => {
    const name = comment.authorName ?? t("A member");
    const sameSide =
      thread.viewerSelectionLabel === comment.authorSelectionLabel;
    return (
      <article className="discussion-comment" id={`message-${comment.id}`}>
        <span className="discussion-avatar" aria-hidden="true">
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()}
        </span>
        <div className="discussion-message">
          <header className="discussion-author">
            <strong>{name}</strong>
            <LocalDateTime value={comment.createdAt} />
          </header>
          <div className="discussion-meta">
            <span className="discussion-phase" data-phase={comment.phase}>
              {phaseLabel(comment.phase)}
            </span>
            <span>{teamLabel(comment.authorSelectionLabel)}</span>
          </div>
          <p className="discussion-body">{comment.body}</p>
          <div className="discussion-actions">
            {canPost && (
              <button
                type="button"
                onClick={() => {
                  setReplyTarget(comment);
                  composer.current?.focus();
                }}
              >
                {t("Reply")}
              </button>
            )}
            {!sameSide &&
              (["shame", "slander"] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  disabled={
                    votePending === `${comment.id}:${kind}` ||
                    comment.viewerVoted.includes(kind)
                  }
                  onClick={() => vote(comment.id, kind)}
                >
                  {t(VOTE_LABEL[kind])} (
                  {kind === "shame" ? comment.shameVotes : comment.slanderVotes}
                  )
                </button>
              ))}
            {thread.pins.shame === comment.id && (
              <span className="discussion-pin">{t("Pin of shame")}</span>
            )}
            {thread.pins.slander === comment.id && (
              <span className="discussion-pin">{t("Best slander")}</span>
            )}
          </div>
        </div>
      </article>
    );
  };
  return (
    <section
      className="discussion-group"
      aria-labelledby={`discussion-${thread.groupId}`}
    >
      <header className="discussion-group-heading">
        <h3 id={`discussion-${thread.groupId}`}>{thread.groupName}</h3>
        <span>{t("{p0} comments", { p0: comments.length })}</span>
      </header>
      {comments.length === 0 && (
        <p className="discussion-empty">
          {t("No comments yet. Start the conversation.")}
        </p>
      )}
      {pendingBody && (
        <p className="discussion-body" role="status" aria-busy="true">
          {pendingBody} — {t("Posting…")}
        </p>
      )}
      <div className="discussion-threads">
        {roots.map((root) => {
          const replies = comments.filter(
            (comment) => comment.parentCommentId === root.id,
          );
          const isExpanded = expanded.includes(root.id);
          return (
            <div className="discussion-thread" key={root.id}>
              {renderComment(root)}
              {replies.length > 0 && (
                <>
                  <button
                    type="button"
                    className="discussion-expand"
                    aria-expanded={isExpanded}
                    aria-controls={`replies-${root.id}`}
                    onClick={() =>
                      setExpanded((current) =>
                        isExpanded
                          ? current.filter((id) => id !== root.id)
                          : [...current, root.id],
                      )
                    }
                  >
                    {t(
                      isExpanded ? "Hide comments" : "Show all comments ({p0})",
                      { p0: replies.length },
                    )}
                  </button>
                  <div
                    className="discussion-replies"
                    id={`replies-${root.id}`}
                    hidden={!isExpanded}
                  >
                    {replies.map((reply) => (
                      <div key={reply.id}>{renderComment(reply)}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {voteError && (
        <Banner tone="negative" role="alert">
          {t(voteError)}
        </Banner>
      )}
      <div className="discussion-composer">
        <p className="discussion-rule">
          {t(
            "One message before kickoff and one after full time. A reply uses the same allowance.",
          )}
        </p>
        {!canPost ? (
          <p role="status">
            {t(
              thread.postingPhase === null
                ? "Posting is closed. Your second message opens after full time."
                : "You have already used your message for this phase.",
            )}
          </p>
        ) : (
          <form onSubmit={submit}>
            <div className="discussion-composer-heading">
              <label htmlFor={fieldId}>{t("Say something")}</label>
              <span>{phaseLabel(thread.postingPhase!)}</span>
            </div>
            {replyTarget && (
              <div className="discussion-reply-target">
                <span>
                  {t("Replying to {p0}", {
                    p0: replyTarget.authorName ?? t("A member"),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTarget(undefined);
                    composer.current?.focus();
                  }}
                >
                  {t("Cancel reply")}
                </button>
              </div>
            )}
            <textarea
              ref={composer}
              id={fieldId}
              className="field"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={280}
              required
              disabled={pending}
              aria-describedby={`${fieldId}-count`}
            />
            {error && (
              <Banner tone="negative" role="alert">
                {t(error)}
              </Banner>
            )}
            <div className="discussion-compose-actions">
              <span id={`${fieldId}-count`}>
                {body.length}/280 · {t("1 message remaining")}
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={pending || !body.trim()}
              >
                {t(pending ? "Posting…" : "Post")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
