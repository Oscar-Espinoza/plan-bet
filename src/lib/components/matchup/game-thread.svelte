<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { useTranslation } from "../language.svelte";
  import LocalDateTime from "../local-date-time.svelte";
  import Banner from "../ui/banner.svelte";
  import Button from "../ui/button.svelte";
  import { matchday } from "#lib/state/store.svelte";
  import type {
    CommentThreadView,
    CommentVoteKind,
    GameCommentPhase,
    GameCommentView,
  } from "#lib/shared/comment-view";

  const VOTE_LABEL: Record<CommentVoteKind, string> = {
    shame: "Shame",
    slander: "Slander",
  };

  let {
    routeId,
    thread,
    matchup,
  }: {
    routeId: string;
    thread: CommentThreadView;
    matchup?: { home: string; away: string };
  } = $props();

  const i18n = useTranslation();
  let composer = $state<HTMLTextAreaElement | undefined>();
  let replyTarget = $state<GameCommentView | undefined>();
  let expanded = $state<string[]>([]);
  let postedPhase = $state<GameCommentPhase | undefined>();
  const canPost = $derived(
    thread.postingPhase !== null &&
      !thread.hasCommented &&
      postedPhase !== thread.postingPhase,
  );
  let body = $state("");
  let error = $state("");
  let pending = $state(false);
  let localComments = $state<GameCommentView[]>([]);
  let optimisticVotes = $state<string[]>([]);
  let pendingBody = $state("");
  let votePending = $state("");
  let voteError = $state("");
  const fieldId = $derived(`comment-${thread.groupId}`);

  let consumedDraft = $state<object | undefined>(undefined);
  const matchingDraft = $derived(
    matchday.commentDraft?.groupId === thread.groupId
      ? matchday.commentDraft
      : undefined,
  );

  $effect(() => {
    const draft = matchingDraft;
    if (draft && draft !== consumedDraft) {
      consumedDraft = draft;
      body = draft.text;
    }
  });

  $effect(() => {
    if (matchingDraft) matchday.clearCommentDraft();
  });

  const comments = $derived.by(() => {
    const merged = [
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
          slanderVotes:
            comment.slanderVotes + Number(added.includes("slander")),
          viewerVoted: [...comment.viewerVoted, ...added],
        };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return merged;
  });

  const roots = $derived.by(() => {
    const ids = new Set(comments.map((comment) => comment.id));
    return comments.filter(
      (comment) =>
        !comment.parentCommentId || !ids.has(comment.parentCommentId),
    );
  });

  function teamLabel(label: string) {
    if (matchup && /^(home|away)$/i.test(label)) {
      return /^home$/i.test(label) ? matchup.home : matchup.away;
    }
    return i18n.t(label);
  }

  function phaseLabel(phase: GameCommentPhase) {
    return i18n.t(phase === "before" ? "Before kickoff" : "After full time");
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!canPost || pending) return;
    pending = true;
    pendingBody = body;
    error = "";
    const response = await fetch(`/api/games/${routeId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: thread.groupId,
        body,
        parentCommentId: replyTarget?.id,
      }),
    }).catch(() => null);
    pending = false;
    pendingBody = "";

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      error = text || "The comment did not go through. Try again.";
      return;
    }

    const payload = await response.json().catch(() => null);
    const saved = payload?.data?.comment as GameCommentView | undefined;
    if (saved?.id && typeof saved.body === "string") {
      localComments = [...localComments, saved];
    }
    if (replyTarget) {
      const parentId = replyTarget.parentCommentId ?? replyTarget.id;
      expanded = [...new Set([...expanded, parentId])];
    }
    postedPhase = thread.postingPhase ?? undefined;
    replyTarget = undefined;
    body = "";
    void refreshAll();
  }

  async function vote(commentId: string, kind: CommentVoteKind) {
    const key = `${commentId}:${kind}`;
    if (votePending || optimisticVotes.includes(key)) return;
    optimisticVotes = [...optimisticVotes, key];
    votePending = key;
    voteError = "";
    const response = await fetch(`/api/comments/${commentId}/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch(() => null);
    votePending = "";

    if (!response?.ok) {
      const payload: unknown = await response?.json().catch(() => null);
      const text =
        payload && typeof payload === "object" && "error" in payload
          ? String(
              (payload as { error: { message?: string } }).error?.message ?? "",
            )
          : "";
      optimisticVotes = optimisticVotes.filter((value) => value !== key);
      voteError = text || "The vote did not go through. Try again.";
      return;
    }

    void refreshAll();
  }
</script>

{#snippet commentArticle(comment: GameCommentView)}
  {@const name = comment.authorName ?? i18n.t("A member")}
  {@const sameSide =
    thread.viewerSelectionLabel === comment.authorSelectionLabel}
  <article class="discussion-comment" id={`message-${comment.id}`}>
    <span class="discussion-avatar" aria-hidden="true">
      {name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()}
    </span>
    <div class="discussion-message">
      <header class="discussion-author">
        <strong>{name}</strong>
        <LocalDateTime value={comment.createdAt} />
      </header>
      <div class="discussion-meta">
        <span class="discussion-phase" data-phase={comment.phase}>
          {phaseLabel(comment.phase)}
        </span>
        <span>{teamLabel(comment.authorSelectionLabel)}</span>
      </div>
      <p class="discussion-body">{comment.body}</p>
      <div class="discussion-actions">
        {#if canPost}
          <button
            type="button"
            onclick={() => {
              replyTarget = comment;
              composer?.focus();
            }}
          >
            {i18n.t("Reply")}
          </button>
        {/if}
        {#if !sameSide}
          {#each ["shame", "slander"] as const as kind (kind)}
            <button
              type="button"
              disabled={votePending === `${comment.id}:${kind}` ||
                comment.viewerVoted.includes(kind)}
              onclick={() => vote(comment.id, kind)}
            >
              {i18n.t(VOTE_LABEL[kind])} (
              {kind === "shame" ? comment.shameVotes : comment.slanderVotes})
            </button>
          {/each}
        {/if}
        {#if thread.pins.shame === comment.id}
          <span class="discussion-pin">{i18n.t("Pin of shame")}</span>
        {/if}
        {#if thread.pins.slander === comment.id}
          <span class="discussion-pin">{i18n.t("Best slander")}</span>
        {/if}
      </div>
    </div>
  </article>
{/snippet}

<section
  class="discussion-group"
  aria-labelledby={`discussion-${thread.groupId}`}
>
  <header class="discussion-group-heading">
    <h3 id={`discussion-${thread.groupId}`}>{thread.groupName}</h3>
    <span>{i18n.t("{p0} comments", { p0: comments.length })}</span>
  </header>
  {#if comments.length === 0}
    <p class="discussion-empty">
      {i18n.t("No comments yet. Start the conversation.")}
    </p>
  {/if}
  {#if pendingBody}
    <p class="discussion-body" role="status" aria-busy="true">
      {pendingBody} — {i18n.t("Posting…")}
    </p>
  {/if}
  <div class="discussion-threads">
    {#each roots as root (root.id)}
      {@const replies = comments.filter(
        (comment) => comment.parentCommentId === root.id,
      )}
      {@const isExpanded = expanded.includes(root.id)}
      <div class="discussion-thread">
        {@render commentArticle(root)}
        {#if replies.length > 0}
          <button
            type="button"
            class="discussion-expand"
            aria-expanded={isExpanded}
            aria-controls={`replies-${root.id}`}
            onclick={() => {
              expanded = isExpanded
                ? expanded.filter((id) => id !== root.id)
                : [...expanded, root.id];
            }}
          >
            {i18n.t(isExpanded ? "Hide comments" : "Show all comments ({p0})", {
              p0: replies.length,
            })}
          </button>
          <div
            class="discussion-replies"
            id={`replies-${root.id}`}
            hidden={!isExpanded}
          >
            {#each replies as reply (reply.id)}
              <div>{@render commentArticle(reply)}</div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
  {#if voteError}
    <Banner tone="negative" role="alert">{i18n.t(voteError)}</Banner>
  {/if}
  <div class="discussion-composer">
    <p class="discussion-rule">
      {i18n.t(
        "One message before kickoff and one after full time. A reply uses the same allowance.",
      )}
    </p>
    {#if !canPost}
      <p role="status">
        {i18n.t(
          thread.postingPhase === null
            ? "Posting is closed. Your second message opens after full time."
            : "You have already used your message for this phase.",
        )}
      </p>
    {:else}
      <form onsubmit={submit}>
        <div class="discussion-composer-heading">
          <label for={fieldId}>{i18n.t("Say something")}</label>
          <span>{phaseLabel(thread.postingPhase!)}</span>
        </div>
        {#if replyTarget}
          <div class="discussion-reply-target">
            <span>
              {i18n.t("Replying to {p0}", {
                p0: replyTarget.authorName ?? i18n.t("A member"),
              })}
            </span>
            <button
              type="button"
              onclick={() => {
                replyTarget = undefined;
                composer?.focus();
              }}
            >
              {i18n.t("Cancel reply")}
            </button>
          </div>
        {/if}
        <textarea
          bind:this={composer}
          id={fieldId}
          class="field"
          bind:value={body}
          maxlength={280}
          required
          disabled={pending}
          aria-describedby={`${fieldId}-count`}></textarea>
        {#if error}
          <Banner tone="negative" role="alert">{i18n.t(error)}</Banner>
        {/if}
        <div class="discussion-compose-actions">
          <span id={`${fieldId}-count`}>
            {body.length}/280 · {i18n.t("1 message remaining")}
          </span>
          <Button type="submit" size="sm" disabled={pending || !body.trim()}>
            {i18n.t(pending ? "Posting…" : "Post")}
          </Button>
        </div>
      </form>
    {/if}
  </div>
</section>
