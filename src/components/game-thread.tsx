"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import type { GameComment } from "@/lib/contracts";

// Whether the viewer has already commented for the *current* phase is
// derived server-side (same clock `postComment` re-derives on write) and
// shipped as this one flag, so the client never does its own kickoff math.
export type CommentThreadView = {
  groupId: string;
  groupName: string;
  comments: GameComment[];
  hasCommented: boolean;
};

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
  const fieldId = `comment-${thread.groupId}`;

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

  return (
    <div className="side-form">
      <h3 className="field-label">{thread.groupName}</h3>
      {thread.comments.map((comment) => (
        <p className="fine-print" key={comment.id}>
          {comment.authorName ?? "A member"} · {comment.phase} — {comment.body}
        </p>
      ))}
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
