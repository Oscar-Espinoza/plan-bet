import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { gameComments, games, groups, users, wagers } from "@/db/schema";
import {
  gameCommentSchema,
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

function rowToComment(
  row: typeof gameComments.$inferSelect,
  authorName: string | null,
): GameComment {
  return gameCommentSchema.parse({
    id: row.id,
    groupId: row.groupId,
    userId: row.userId,
    authorName,
    phase: row.phase,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
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
    .select({ comment: gameComments, authorName: users.name })
    .from(gameComments)
    .innerJoin(users, eq(users.id, gameComments.userId))
    .where(
      and(
        inArray(gameComments.groupId, groupIds),
        eq(gameComments.canonicalGameId, canonicalGameId),
      ),
    )
    .orderBy(asc(gameComments.createdAt));

  return eligibleGroups.map((group) => ({
    groupId: group.groupId!,
    groupName: group.groupName,
    comments: commentRows
      .filter((row) => row.comment.groupId === group.groupId)
      .map((row) => rowToComment(row.comment, row.authorName)),
  }));
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
    .select({ id: wagers.id })
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

  return { ok: true, comment: rowToComment(row, input.actorName ?? null) };
}
