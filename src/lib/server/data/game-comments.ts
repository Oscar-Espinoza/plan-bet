import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  commentVoteKindSchema,
  gameCommentSchema,
  type CommentVoteKind,
  gameSummarySchema,
  type GameComment,
  type GameCommentPhase,
  type GameStatus,
} from "../domain/contracts";
import { getDatabase } from "../db/client";
import {
  commentVotes,
  gameComments,
  games,
  groupMembers,
  groups,
  user,
  wagers,
} from "../db/schema";
import { isGroupMember } from "./groups-repository";

/** The second message opens only when the provider confirms full time. */
export function commentPhase(
  scheduledAt: Date | string | number,
  now: Date,
  status: GameStatus,
): GameCommentPhase | null {
  if (status === "finished") return "after";
  const kickoff = new Date(scheduledAt).getTime();
  if (status === "scheduled" && now.getTime() < kickoff) return "before";
  return null;
}

type VoteTally = {
  shameVotes: number;
  slanderVotes: number;
  viewerVoted: CommentVoteKind[];
};

const NO_VOTES: VoteTally = {
  shameVotes: 0,
  slanderVotes: 0,
  viewerVoted: [],
};

function toIso(value: Date | number | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function rowToComment(
  row: typeof gameComments.$inferSelect,
  authorName: string | null,
  authorSelectionLabel: string | null,
  tally: VoteTally,
): GameComment {
  return gameCommentSchema.parse({
    id: row.id,
    parentCommentId: row.parentCommentId,
    groupId: row.groupId,
    userId: row.userId,
    authorName,
    authorSelectionLabel: authorSelectionLabel ?? "",
    phase: row.phase,
    body: row.body,
    createdAt: toIso(row.createdAt),
    ...tally,
  });
}

export type CommentThread = {
  groupId: string;
  groupName: string;
  comments: GameComment[];
};

/**
 * One entry per group where the viewer has a wager on this game and is still
 * a member — the same eligibility `postComment` re-checks on write.
 */
export async function listCommentThreads(
  userId: string,
  canonicalGameId: string,
): Promise<CommentThread[]> {
  const eligibleGroups = await getDatabase()
    .selectDistinct({ groupId: wagers.groupId, groupName: groups.name })
    .from(wagers)
    .innerJoin(groups, eq(groups.id, wagers.groupId))
    .innerJoin(
      groupMembers,
      and(
        eq(groupMembers.groupId, wagers.groupId),
        eq(groupMembers.userId, userId),
      ),
    )
    .where(
      and(
        eq(wagers.userId, userId),
        eq(wagers.canonicalGameId, canonicalGameId),
        sql`${wagers.groupId} is not null`,
      ),
    );
  if (eligibleGroups.length === 0) return [];

  const groupIds = eligibleGroups.map((row) => row.groupId!);
  const commentRows = await getDatabase()
    .select({
      comment: gameComments,
      authorName: user.name,
      authorSelectionLabel: sql<string | null>`(
        select ${wagers.selectionLabel} from ${wagers}
        where ${wagers.groupId} = ${gameComments.groupId}
          and ${wagers.userId} = ${gameComments.userId}
          and ${wagers.canonicalGameId} = ${canonicalGameId}
        limit 1
      )`,
    })
    .from(gameComments)
    .innerJoin(user, eq(user.id, gameComments.userId))
    .where(
      and(
        inArray(gameComments.groupId, groupIds),
        eq(gameComments.canonicalGameId, canonicalGameId),
      ),
    )
    .orderBy(asc(gameComments.createdAt));

  const commentIds = commentRows.map((row) => row.comment.id);
  const tallyRows = commentIds.length
    ? await getDatabase()
        .select({
          commentId: commentVotes.commentId,
          kind: commentVotes.kind,
          votes: sql<number>`count(*)`.mapWith(Number),
          viewerVoted: sql<boolean>`max(case when ${commentVotes.userId} = ${userId} then 1 else 0 end) = 1`,
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
    if (row.viewerVoted) {
      const parsed = commentVoteKindSchema.safeParse(row.kind);
      if (parsed.success) tally.viewerVoted.push(parsed.data);
    }
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
  | { ok: false; reason: "phase_closed" }
  | { ok: false; reason: "invalid_parent" }
  | { ok: false; reason: "unavailable" };

export async function postComment(input: {
  userId: string;
  groupId: string;
  canonicalGameId: string;
  body: string;
  parentCommentId?: string;
  now: Date;
  actorName?: string | null;
}): Promise<PostCommentResult> {
  const db = getDatabase();

  const [game] = await db
    .select({
      scheduledAt: games.scheduledAt,
      summary: games.summary,
    })
    .from(games)
    .where(eq(games.canonicalId, input.canonicalGameId))
    .limit(1);
  if (!game) return { ok: false, reason: "unavailable" };

  const summary = gameSummarySchema.parse(game.summary);
  const phase = commentPhase(game.scheduledAt, input.now, summary.status);
  if (!phase) return { ok: false, reason: "phase_closed" };

  let parentCommentId: string | null = null;
  if (input.parentCommentId) {
    const [target] = await db
      .select()
      .from(gameComments)
      .where(
        and(
          eq(gameComments.id, input.parentCommentId),
          eq(gameComments.groupId, input.groupId),
          eq(gameComments.canonicalGameId, input.canonicalGameId),
        ),
      )
      .limit(1);
    if (!target) return { ok: false, reason: "invalid_parent" };
    parentCommentId = target.parentCommentId ?? target.id;
    if (target.parentCommentId) {
      const [root] = await db
        .select({ id: gameComments.id })
        .from(gameComments)
        .where(
          and(
            eq(gameComments.id, parentCommentId),
            eq(gameComments.groupId, input.groupId),
            eq(gameComments.canonicalGameId, input.canonicalGameId),
            sql`${gameComments.parentCommentId} is null`,
          ),
        )
        .limit(1);
      if (!root) return { ok: false, reason: "invalid_parent" };
    }
  }

  const commentId = crypto.randomUUID();
  const nowMs = input.now.getTime();
  const [row] = await db
    .insert(gameComments)
    .select(
      sql`
      select
        ${commentId},
        ${input.groupId},
        ${input.canonicalGameId},
        ${input.userId},
        ${parentCommentId},
        ${phase},
        ${input.body},
        ${nowMs}
      where exists (
        select 1 from ${groupMembers}
        where ${groupMembers.groupId} = ${input.groupId}
          and ${groupMembers.userId} = ${input.userId}
      )
      and exists (
        select 1 from ${wagers}
        where ${wagers.userId} = ${input.userId}
          and ${wagers.groupId} = ${input.groupId}
          and ${wagers.canonicalGameId} = ${input.canonicalGameId}
      )
    `,
    )
    .onConflictDoNothing()
    .returning();

  if (!row) {
    if (!(await isGroupMember(input.groupId, input.userId))) {
      return { ok: false, reason: "not_eligible" };
    }
    const [eligible] = await db
      .select({ selectionLabel: wagers.selectionLabel })
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
    return { ok: false, reason: "already_commented" };
  }

  const [eligible] = await db
    .select({ selectionLabel: wagers.selectionLabel })
    .from(wagers)
    .where(
      and(
        eq(wagers.userId, input.userId),
        eq(wagers.groupId, input.groupId),
        eq(wagers.canonicalGameId, input.canonicalGameId),
      ),
    )
    .limit(1);

  return {
    ok: true,
    comment: rowToComment(
      row,
      input.actorName ?? null,
      eligible?.selectionLabel ?? null,
      NO_VOTES,
    ),
  };
}

export type CastVoteResult =
  | { ok: true }
  | { ok: false; reason: "not_eligible" }
  | { ok: false; reason: "already_voted" }
  | { ok: false; reason: "unavailable" };

export async function castVote(input: {
  userId: string;
  commentId: string;
  kind: CommentVoteKind;
}): Promise<CastVoteResult> {
  const db = getDatabase();
  const [comment] = await db
    .select({
      groupId: gameComments.groupId,
      canonicalGameId: gameComments.canonicalGameId,
      authorId: gameComments.userId,
    })
    .from(gameComments)
    .where(eq(gameComments.id, input.commentId))
    .limit(1);
  if (!comment) return { ok: false, reason: "unavailable" };

  const [voterWager] = await db
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

  const [authorWager] = await db
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

  if (voterWager.selectionId === authorWager.selectionId) {
    return { ok: false, reason: "not_eligible" };
  }

  const nowMs = Date.now();
  const [voted] = await db
    .insert(commentVotes)
    .select(
      sql`
      select
        ${input.commentId},
        ${input.userId},
        ${input.kind},
        ${nowMs}
      where exists (
        select 1 from ${groupMembers}
        where ${groupMembers.groupId} = ${comment.groupId}
          and ${groupMembers.userId} = ${input.userId}
      )
      and exists (
        select 1 from ${wagers}
        where ${wagers.userId} = ${input.userId}
          and ${wagers.groupId} = ${comment.groupId}
          and ${wagers.canonicalGameId} = ${comment.canonicalGameId}
      )
    `,
    )
    .onConflictDoNothing()
    .returning();

  if (!voted) {
    if (!(await isGroupMember(comment.groupId, input.userId))) {
      return { ok: false, reason: "not_eligible" };
    }
    if (!voterWager) return { ok: false, reason: "not_eligible" };
    return { ok: false, reason: "already_voted" };
  }

  return { ok: true };
}
