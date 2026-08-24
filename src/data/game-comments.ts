import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  commentVotes,
  gameComments,
  games,
  groups,
  users,
  wagers,
} from "@/db/schema";
import {
  gameCommentSchema,
  type CommentVoteKind,
  type GameComment,
  type GameCommentPhase,
} from "@/lib/contracts";

/**
 * Pure: `now < scheduledAt` is "before", everything from kickoff on is
 * "after". The one branch this feature grades on a clock, so it is the one
 * thing here with a unit test — same discipline as the frozen wager price.
 */
export function commentPhase(
  scheduledAt: Date | string,
  now: Date,
): GameCommentPhase {
  return now.getTime() < new Date(scheduledAt).getTime() ? "before" : "after";
}

type VoteTally = {
  shameVotes: number;
  slanderVotes: number;
  viewerVoted: CommentVoteKind[];
};

const NO_VOTES: VoteTally = { shameVotes: 0, slanderVotes: 0, viewerVoted: [] };

function rowToComment(
  row: typeof gameComments.$inferSelect,
  authorName: string | null,
  authorSelectionLabel: string | null,
  tally: VoteTally,
): GameComment {
  return gameCommentSchema.parse({
    id: row.id,
    groupId: row.groupId,
    userId: row.userId,
    authorName,
    authorSelectionLabel: authorSelectionLabel ?? "",
    phase: row.phase,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    ...tally,
  });
}

export type CommentThread = {
  groupId: string;
  groupName: string;
  comments: GameComment[];
};

/**
 * One entry per group where the viewer has a wager on this game — the same
 * eligibility predicate `postComment` re-checks on write. `[]` for a solo
 * user, the normal state: a `wagers.groupId` is only ever set once
 * `placeWager` has already verified membership, so reading it back here
 * needs no separate `group_members` join.
 */
export async function listCommentThreads(
  userId: string,
  canonicalGameId: string,
): Promise<CommentThread[]> {
  const eligibleGroups = await getDatabase()
    .selectDistinct({ groupId: wagers.groupId, groupName: groups.name })
    .from(wagers)
    .innerJoin(groups, eq(groups.id, wagers.groupId))
    .where(
      and(
        eq(wagers.userId, userId),
        eq(wagers.canonicalGameId, canonicalGameId),
      ),
    );
  if (eligibleGroups.length === 0) return [];

  const groupIds = eligibleGroups.map((row) => row.groupId!);
  const commentRows = await getDatabase()
    .select({
      comment: gameComments,
      authorName: users.name,
      // Correlated, not a second round trip: the author's side on this same
      // game, in this same group — the field that makes "you may only vote
      // across the aisle" legible next to the comment itself.
      authorSelectionLabel: sql<string | null>`(
        select ${wagers.selectionLabel} from ${wagers}
        where ${wagers.groupId} = ${gameComments.groupId}
          and ${wagers.userId} = ${gameComments.userId}
          and ${wagers.canonicalGameId} = ${canonicalGameId}
        limit 1
      )`,
    })
    .from(gameComments)
    .innerJoin(users, eq(users.id, gameComments.userId))
    .where(
      and(
        inArray(gameComments.groupId, groupIds),
        eq(gameComments.canonicalGameId, canonicalGameId),
      ),
    )
    .orderBy(asc(gameComments.createdAt));

  // The one extra grouped read the tally and the pins need, over the
  // comments already loaded above.
  const commentIds = commentRows.map((row) => row.comment.id);
  const tallyRows = commentIds.length
    ? await getDatabase()
        .select({
          commentId: commentVotes.commentId,
          kind: commentVotes.kind,
          votes: sql<number>`count(*)::int`,
          viewerVoted: sql<boolean>`bool_or(${commentVotes.userId} = ${userId})`,
        })
        .from(commentVotes)
        .where(inArray(commentVotes.commentId, commentIds))
        .groupBy(commentVotes.commentId, commentVotes.kind)
    : [];

  const tallyByComment = new Map<string, VoteTally>();
  for (const row of tallyRows) {
    const tally = tallyByComment.get(row.commentId) ?? {
      ...NO_VOTES,
      viewerVoted: [],
    };
    if (row.kind === "shame") tally.shameVotes = row.votes;
    else tally.slanderVotes = row.votes;
    if (row.viewerVoted) tally.viewerVoted.push(row.kind);
    tallyByComment.set(row.commentId, tally);
  }

  return eligibleGroups.map((group) => ({
    groupId: group.groupId!,
    groupName: group.groupName,
    comments: commentRows
      .filter((row) => row.comment.groupId === group.groupId)
      .map((row) =>
        rowToComment(
          row.comment,
          row.authorName,
          row.authorSelectionLabel,
          tallyByComment.get(row.comment.id) ?? NO_VOTES,
        ),
      ),
  }));
}

/**
 * The comment id with the most votes of each kind, `undefined` below one
 * vote — no pin for a comment nobody has pinned. Comments arrive ordered
 * `createdAt asc`, so the strict `>` below gives earliest-wins on a tie for
 * free, without any extra tie-breaking logic.
 */
export function pickPins(comments: GameComment[]): {
  shame?: string;
  slander?: string;
} {
  let shame: { id: string; votes: number } | undefined;
  let slander: { id: string; votes: number } | undefined;
  for (const comment of comments) {
    if (
      comment.shameVotes > 0 &&
      (!shame || comment.shameVotes > shame.votes)
    ) {
      shame = { id: comment.id, votes: comment.shameVotes };
    }
    if (
      comment.slanderVotes > 0 &&
      (!slander || comment.slanderVotes > slander.votes)
    ) {
      slander = { id: comment.id, votes: comment.slanderVotes };
    }
  }
  return { shame: shame?.id, slander: slander?.id };
}

export type PostCommentResult =
  | { ok: true; comment: GameComment }
  | { ok: false; reason: "not_eligible" }
  | { ok: false; reason: "already_commented" }
  | { ok: false; reason: "unavailable" };

/**
 * Never throws for an expected outcome, matching `PlaceWagerResult`'s shape.
 * Eligibility and phase are both re-derived here rather than trusted from
 * the caller — the same discipline `placeWager` applies to price and
 * `evaluateWagerAvailability`. `already_commented` comes from
 * `.onConflictDoNothing()` returning no row, not a pre-read: one statement,
 * and the unique index settles the race.
 */
export async function postComment(input: {
  userId: string;
  groupId: string;
  canonicalGameId: string;
  body: string;
  now: Date;
  actorName?: string | null;
}): Promise<PostCommentResult> {
  const [eligible] = await getDatabase()
    .select({ id: wagers.id, selectionLabel: wagers.selectionLabel })
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, input.userId),
        eq(wagers.groupId, input.groupId),
        eq(wagers.canonicalGameId, input.canonicalGameId),
      ),
    )
    .limit(1);
  if (!eligible) return { ok: false, reason: "not_eligible" };

  const [game] = await getDatabase()
    .select({ scheduledAt: games.scheduledAt })
    .from(games)
    .where(eq(games.canonicalId, input.canonicalGameId))
    .limit(1);
  if (!game) return { ok: false, reason: "unavailable" };

  const phase = commentPhase(game.scheduledAt, input.now);

  const [row] = await getDatabase()
    .insert(gameComments)
    .values({
      groupId: input.groupId,
      canonicalGameId: input.canonicalGameId,
      userId: input.userId,
      phase,
      body: input.body,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return { ok: false, reason: "already_commented" };

  return {
    ok: true,
    comment: rowToComment(
      row,
      input.actorName ?? null,
      eligible.selectionLabel,
      NO_VOTES,
    ),
  };
}

export type CastVoteResult =
  | { ok: true }
  | { ok: false; reason: "not_eligible" }
  | { ok: false; reason: "already_voted" }
  | { ok: false; reason: "unavailable" };

/**
 * Side-scoped, cross-side only: the voter's side and the author's side are
 * both re-derived from `wagers.selectionId` here, never trusted from the
 * request — the same discipline `postComment` applies to eligibility. A pin
 * only exists because the *opposition* awarded it, which is what makes this
 * a reputation system rather than a popularity contest you can self-deal:
 * voting on your own comment is excluded by the side comparison below for
 * free (same user, same wager, same selection).
 */
export async function castVote(input: {
  userId: string;
  commentId: string;
  kind: CommentVoteKind;
}): Promise<CastVoteResult> {
  const [comment] = await getDatabase()
    .select({
      groupId: gameComments.groupId,
      canonicalGameId: gameComments.canonicalGameId,
      authorId: gameComments.userId,
    })
    .from(gameComments)
    .where(eq(gameComments.id, input.commentId))
    .limit(1);
  if (!comment) return { ok: false, reason: "unavailable" };

  const [voterWager] = await getDatabase()
    .select({ selectionId: wagers.selectionId })
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, input.userId),
        eq(wagers.groupId, comment.groupId),
        eq(wagers.canonicalGameId, comment.canonicalGameId),
      ),
    )
    .limit(1);
  if (!voterWager) return { ok: false, reason: "not_eligible" };

  const [authorWager] = await getDatabase()
    .select({ selectionId: wagers.selectionId })
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, comment.authorId),
        eq(wagers.groupId, comment.groupId),
        eq(wagers.canonicalGameId, comment.canonicalGameId),
      ),
    )
    .limit(1);
  if (!authorWager) return { ok: false, reason: "unavailable" };

  // This is the side-scoping: cross-side only, one string comparison because
  // wagers.selectionId is already the canonical side.
  if (voterWager.selectionId === authorWager.selectionId) {
    return { ok: false, reason: "not_eligible" };
  }

  const [voted] = await getDatabase()
    .insert(commentVotes)
    .values({
      commentId: input.commentId,
      userId: input.userId,
      kind: input.kind,
    })
    .onConflictDoNothing()
    .returning();
  if (!voted) return { ok: false, reason: "already_voted" };

  return { ok: true };
}
