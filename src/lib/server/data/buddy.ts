import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { translate, type Locale } from "../../shared/locale";
import { marketsFor } from "../../shared/markets";
import "../locale";
import { estimateCostMicros } from "../ai-cost";
import {
  gameSummarySchema,
  type EvidenceFact,
  type GameCommentPhase,
  type GameStatus,
  type GroupLeaderboardEntry,
  type RecordSlices,
} from "../domain/contracts";
import { getDatabase, isDatabaseConfigured } from "../db/client";
import { commentVotes, gameComments, groups, user, wagers } from "../db/schema";
import { logEvent } from "../logger";
import { isOpenAiConfigured, OpenAiClient } from "../providers/openai/client";
import { ProviderError } from "../providers/provider-error";
import {
  claimBuddyTurn,
  deleteBuddyNotes,
  hashSessionId,
  listBuddyNotes,
  recordBuddyReply,
  saveBuddyNote,
} from "./buddy-repository";
import { listBoardContext } from "./fixture-context-repository";
import {
  getGroupBySlug,
  getGroupLeaderboard,
  isGroupMember,
} from "./groups-repository";
import { getGameDetail } from "./sports-data";
import { getRecordSlices, readGameForWager } from "./wagers-repository";
import {
  buildBuddyInput,
  type BuddyContext,
  type BuddyInput,
  type BuddyTurn,
} from "../buddy-prompt";
import { parseBuddyReply } from "../buddy-validation";

export {
  BUDDY_IP_DAILY_LIMIT,
  BUDDY_SESSION_DAILY_LIMIT,
} from "./buddy-repository";

/** "Forget what you know about me" — clears every note for this session. */
export async function forgetBuddySession(sessionId: string) {
  if (!isDatabaseConfigured()) return;
  await deleteBuddyNotes(hashSessionId(sessionId));
}

const MAX_OUTPUT_TOKENS = 500;

function fact(id: string, label: string, value: string): EvidenceFact {
  return {
    id,
    label,
    value,
    valueType: "text",
    sourceId: "app",
    observedAt: new Date().toISOString(),
  };
}

function recordFacts(slices: RecordSlices) {
  const line = (slice: { won: number; lost: number; voided: number }) =>
    `${slice.won}-${slice.lost}${slice.voided ? `-${slice.voided}` : ""}`;
  return [
    ...slices.bySport.map((slice, index) =>
      fact(`record-sport-${index}`, `${slice.label} record`, line(slice)),
    ),
    ...slices.byMarket.map((slice, index) =>
      fact(`record-market-${index}`, `${slice.label} record`, line(slice)),
    ),
  ];
}

function leaderboardFacts(entries: GroupLeaderboardEntry[]) {
  return entries.map((entry, index) =>
    fact(
      `leaderboard-${index}`,
      entry.name?.trim() || "A member",
      `${entry.won}-${entry.lost}${entry.voided ? `-${entry.voided}` : ""}, net ${entry.netReturn}`,
    ),
  );
}

// ponytail: the whole board in one prompt, ~15 short summaries. Swap to
// retrieval when the corpus outgrows a single prompt.
const RECALL_FIXTURES = 12;

/**
 * One fact per upcoming fixture that has context built — the board itself,
 * for a route with no game in scope. A row whose stored `GameSummary` doesn't
 * parse is skipped, never guessed at.
 */
export function boardFacts(
  rows: { canonicalId: string; game: unknown; summary: string }[],
) {
  const facts = [];
  for (const row of rows) {
    const game = gameSummarySchema.safeParse(row.game);
    if (!game.success) continue;
    facts.push(
      fact(
        `recall-${row.canonicalId}`,
        `${game.data.homeTeam} vs ${game.data.awayTeam}`,
        row.summary,
      ),
    );
  }
  return facts;
}

type ThreadComment = {
  id: string;
  userId: string;
  authorName: string | null;
  authorSelectionLabel: string;
  phase: GameCommentPhase;
  body: string;
  shameVotes: number;
  slanderVotes: number;
};

type CommentThread = {
  groupId: string;
  comments: ThreadComment[];
};

/** The second message opens only when the provider confirms full time. */
function commentPhase(
  scheduledAt: Date | string,
  now: Date,
  status: GameStatus,
): GameCommentPhase | null {
  if (status === "finished") return "after";
  if (
    status === "scheduled" &&
    now.getTime() < new Date(scheduledAt).getTime()
  ) {
    return "before";
  }
  return null;
}

/**
 * The comment id with the most votes of each kind, undefined below one vote.
 * Comments arrive ordered createdAt asc, so a strict `>` gives earliest-wins
 * on a tie.
 */
function pickPins(comments: ThreadComment[]): {
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

/**
 * One entry per group where the viewer has a wager on this game. Kept here
 * because T11 owns `game-comments.ts` and that file is not in this worktree.
 */
async function listCommentThreads(
  userId: string,
  canonicalGameId: string,
): Promise<CommentThread[]> {
  const database = getDatabase();
  const eligibleGroups = await database
    .selectDistinct({ groupId: wagers.groupId })
    .from(wagers)
    .innerJoin(groups, eq(groups.id, wagers.groupId))
    .where(
      and(
        eq(wagers.userId, userId),
        eq(wagers.canonicalGameId, canonicalGameId),
      ),
    );
  const groupsWithId = eligibleGroups.flatMap((row) =>
    row.groupId ? [row.groupId] : [],
  );
  if (groupsWithId.length === 0) return [];

  const groupIds = groupsWithId;
  const commentRows = await database
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
  const voteRows = commentIds.length
    ? await database
        .select({
          commentId: commentVotes.commentId,
          kind: commentVotes.kind,
        })
        .from(commentVotes)
        .where(inArray(commentVotes.commentId, commentIds))
    : [];
  const tallyByComment = new Map<
    string,
    { shameVotes: number; slanderVotes: number }
  >();
  for (const vote of voteRows) {
    const tally = tallyByComment.get(vote.commentId) ?? {
      shameVotes: 0,
      slanderVotes: 0,
    };
    if (vote.kind === "shame") tally.shameVotes += 1;
    else tally.slanderVotes += 1;
    tallyByComment.set(vote.commentId, tally);
  }

  return groupsWithId.map((groupId) => ({
    groupId,
    comments: commentRows
      .filter((row) => row.comment.groupId === groupId)
      .map((row) => {
        const tally = tallyByComment.get(row.comment.id) ?? {
          shameVotes: 0,
          slanderVotes: 0,
        };
        return {
          id: row.comment.id,
          userId: row.comment.userId,
          authorName: row.authorName,
          authorSelectionLabel: row.authorSelectionLabel ?? "",
          phase: row.comment.phase,
          body: row.comment.body,
          shameVotes: tally.shameVotes,
          slanderVotes: tally.slanderVotes,
        };
      }),
  }));
}

/**
 * One fact per comment in a group's thread on this game, plus the two pins
 * when they exist. Skip, don't guess.
 */
export function threadFacts(thread: CommentThread): EvidenceFact[] {
  const facts: EvidenceFact[] = thread.comments.map((comment, index) =>
    fact(
      `thread-${index}`,
      `${comment.authorName ?? "A member"} (${comment.authorSelectionLabel})`,
      comment.body,
    ),
  );
  const pins = pickPins(thread.comments);
  const pinned = (id: string | undefined) =>
    id ? thread.comments.find((comment) => comment.id === id) : undefined;
  const shame = pinned(pins.shame);
  if (shame) {
    facts.push(
      fact(
        "thread-pin-shame",
        "Pin of shame",
        `${shame.authorName ?? "A member"}: ${shame.body}`,
      ),
    );
  }
  const slander = pinned(pins.slander);
  if (slander) {
    facts.push(
      fact(
        "thread-pin-slander",
        "Best slander",
        `${slander.authorName ?? "A member"}: ${slander.body}`,
      ),
    );
  }
  return facts;
}

/**
 * The client sends `route` — the pathname it's on — never a fact. Every fact
 * the buddy can cite is looked up here, server-side, from that route and the
 * viewer's own session; group membership and account ownership are
 * re-checked here, never trusted from the request. `routeLabel` is what gets
 * stored and logged: the context kind and scope, never a raw URL.
 */
export async function resolveContext(
  route: string,
  viewer: { userId?: string },
): Promise<{ context: BuddyContext; routeLabel: string }> {
  const none = { context: { kind: "none" as const }, routeLabel: "none" };

  const gameMatch = route.match(/^\/games\/([^/?#]+)\/?$/);
  if (gameMatch) {
    const routeId = gameMatch[1]!;
    const detail = await getGameDetail(routeId);
    if (!detail) return none;
    const facts = [...detail.snapshot.evidenceFacts];
    let draft: { groupId: string } | undefined;
    if (viewer.userId && isDatabaseConfigured()) {
      const game = await readGameForWager(routeId).catch(() => undefined);
      if (game) {
        const threads = await listCommentThreads(
          viewer.userId,
          game.canonicalId,
        ).catch(() => [] as CommentThread[]);
        const thread = threads[0];
        if (thread) {
          facts.push(...threadFacts(thread));
          const phase = commentPhase(
            game.summary.scheduledAt,
            new Date(),
            game.summary.status,
          );
          const hasCommented = thread.comments.some(
            (comment) =>
              comment.userId === viewer.userId && comment.phase === phase,
          );
          if (phase && !hasCommented) draft = { groupId: thread.groupId };
        }
      }
    }
    return {
      context: {
        kind: "game",
        facts,
        allowedPickIds: marketsFor(detail.snapshot.game.sport).flatMap(
          (market) =>
            market.selections.map(
              (selection) => `${market.id}:${selection.id}`,
            ),
        ),
        ...(draft ? { draft } : {}),
      },
      routeLabel: `game:${detail.snapshot.game.id}`,
    };
  }

  if (route === "/you") {
    if (!viewer.userId) return none;
    const slices = await getRecordSlices(viewer.userId);
    return {
      context: { kind: "you", facts: recordFacts(slices) },
      routeLabel: "you",
    };
  }

  const groupMatch = route.match(/^\/groups\/([^/?#]+)\/?$/);
  if (groupMatch) {
    if (!viewer.userId) return none;
    const group = await getGroupBySlug(groupMatch[1]!);
    if (!group || !(await isGroupMember(group.id, viewer.userId))) return none;
    const leaderboard = await getGroupLeaderboard(group.id);
    return {
      context: { kind: "group", facts: leaderboardFacts(leaderboard) },
      routeLabel: `group:${group.id}`,
    };
  }

  if (!isDatabaseConfigured()) return none;
  const rows = await listBoardContext({ limit: RECALL_FIXTURES }).catch(
    () => [],
  );
  const facts = boardFacts(rows);
  if (facts.length === 0) return none;
  return { context: { kind: "recall", facts }, routeLabel: "recall" };
}

type FallbackReason = "ai_unconfigured" | "metering_unavailable";

/** No model call: labelled plainly, one line per fact, and never leans. */
function deterministicReply(
  context: BuddyContext,
  reason: FallbackReason,
  locale: Locale = "en",
) {
  const t = (message: string) => translate(locale, message);
  if (context.kind === "none" || context.facts.length === 0) {
    return {
      prose: t(
        reason === "ai_unconfigured"
          ? "AI isn't configured on this deployment, so I can't put together a take here. Check the board for the schedule instead."
          : "The buddy can't take questions right now. Try again in a bit, or check the board for the schedule.",
      ),
      factIds: [] as string[],
    };
  }
  const lines = context.facts.map(
    (item) =>
      `${t(item.label)}: ${item.valueType === "datetime" ? t("see this page for the exact time") : t(item.value)} [${item.id}]`,
  );
  return {
    prose: t(
      reason === "ai_unconfigured"
        ? `AI isn't configured on this deployment, so here's the evidence plainly, with no lean — ${lines.join(" ")}`
        : `The buddy can't give a take right now, so here's the evidence plainly, with no lean — ${lines.join(" ")}`,
    ),
    factIds: context.facts.map((item) => item.id),
  };
}

function providerReason(error: unknown) {
  if (!(error instanceof ProviderError)) return "provider_unavailable";
  if (error.code === "timeout") return "provider_timeout";
  if (error.code === "rate_limited") return "provider_rate_limited";
  return "provider_unavailable";
}

export type BuddyStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      ok: boolean;
      prose: string;
      factIds: string[];
      pickId?: string;
      draft?: { groupId: string; text: string };
      quota?: { remaining: number; resetAt: string };
      reason?: string;
    };

type TurnInput = {
  locale?: Locale;
  timeZone?: string;
  conversation: string;
  route: string;
  question: string;
  history: BuddyTurn[];
  userId?: string;
  sessionId: string;
  clientAddressHash: string | null;
  requestId: string;
  now?: Date;
  fetch?: typeof globalThis.fetch;
};

export type BuddyPreflight =
  | { status: "quota_exceeded"; resetAt: string }
  | { status: "ready"; run: () => AsyncGenerator<BuddyStreamEvent> };

/**
 * Everything that must happen before a byte reaches the client: resolving
 * grounding facts, and — the one check that has to fail before the response
 * even starts, not mid-stream — claiming the daily quota. A missing OpenAI
 * key returns before any claim. A missing salt, IP, or database, or a claim
 * that throws, also returns the deterministic reply and does not call the model.
 */
export async function prepareBuddyTurn(
  input: TurnInput,
): Promise<BuddyPreflight> {
  const now = input.now ?? new Date();
  const dbConfigured = isDatabaseConfigured();
  const sessionHash = hashSessionId(input.sessionId);
  const [{ context, routeLabel }, notes] = await Promise.all([
    resolveContext(input.route, { userId: input.userId }),
    dbConfigured
      ? listBuddyNotes(sessionHash).catch(() => [] as string[])
      : ([] as string[]),
  ]);
  const prompt = buildBuddyInput({
    context,
    history: input.history,
    locale: input.locale,
    timeZone: input.timeZone,
    question: input.question,
    notes,
  });

  const persistReply = async (row: {
    text: string;
    factIds: string[];
    pickId?: string;
    status: "ok" | "rejected" | "failed";
    reason?: string;
  }) => {
    if (!dbConfigured || !input.clientAddressHash) return;
    await recordBuddyReply({
      conversation: input.conversation,
      userId: input.userId,
      sessionHash,
      ipHash: input.clientAddressHash,
      route: routeLabel,
      ...row,
    }).catch((error) => {
      logEvent("warn", "buddy_audit_failed", {
        requestId: input.requestId,
        errorCode:
          error instanceof Error && "code" in error
            ? String((error as { code: unknown }).code)
            : "persistence_error",
      });
    });
  };

  const saveNote = async (note: string) => {
    if (!dbConfigured) return;
    await saveBuddyNote({ userId: input.userId, sessionHash, note }).catch(
      (error) => {
        logEvent("warn", "buddy_audit_failed", {
          requestId: input.requestId,
          operation: "save_note",
          errorCode:
            error instanceof Error && "code" in error
              ? String((error as { code: unknown }).code)
              : "persistence_error",
        });
      },
    );
  };

  const fallback = (reason: FallbackReason): BuddyPreflight => ({
    status: "ready",
    run: () => streamFallback(context, routeLabel, input, persistReply, reason),
  });

  if (!isOpenAiConfigured()) return fallback("ai_unconfigured");

  if (!dbConfigured || !input.clientAddressHash) {
    return fallback("metering_unavailable");
  }

  let claim: Awaited<ReturnType<typeof claimBuddyTurn>>;
  try {
    claim = await claimBuddyTurn({
      conversation: input.conversation,
      userId: input.userId,
      sessionHash,
      ipHash: input.clientAddressHash,
      route: routeLabel,
      text: input.question,
      now,
    });
  } catch (error) {
    logEvent("warn", "buddy_audit_failed", {
      requestId: input.requestId,
      operation: "claim_turn",
      errorCode:
        error instanceof Error && "code" in error
          ? String((error as { code: unknown }).code)
          : "persistence_error",
    });
    return fallback("metering_unavailable");
  }

  if (!claim.allowed) {
    logEvent("info", "buddy_turn", {
      requestId: input.requestId,
      route: routeLabel,
      status: "quota_exceeded",
    });
    return { status: "quota_exceeded", resetAt: claim.resetAt.toISOString() };
  }

  return {
    status: "ready",
    run: () =>
      streamLive(prompt, routeLabel, input, persistReply, claim, saveNote),
  };
}

async function* streamFallback(
  context: BuddyContext,
  routeLabel: string,
  input: TurnInput,
  persistReply: (row: {
    text: string;
    factIds: string[];
    status: "ok" | "rejected" | "failed";
    reason?: string;
  }) => Promise<void>,
  reason: FallbackReason,
): AsyncGenerator<BuddyStreamEvent> {
  const fallback = deterministicReply(context, reason, input.locale);
  await persistReply({
    text: fallback.prose,
    factIds: fallback.factIds,
    status: "ok",
    reason,
  });
  logEvent("info", "buddy_turn", {
    requestId: input.requestId,
    route: routeLabel,
    status: "fallback",
    reason,
  });
  yield { type: "delta", text: fallback.prose };
  yield {
    type: "done",
    ok: true,
    prose: fallback.prose,
    factIds: fallback.factIds,
    reason,
  };
}

async function* streamLive(
  prompt: BuddyInput,
  routeLabel: string,
  input: TurnInput,
  persistReply: (row: {
    text: string;
    factIds: string[];
    pickId?: string;
    status: "ok" | "rejected" | "failed";
    reason?: string;
  }) => Promise<void>,
  claim: Awaited<ReturnType<typeof claimBuddyTurn>>,
  saveNote: (note: string) => Promise<void>,
): AsyncGenerator<BuddyStreamEvent> {
  const startedAt = Date.now();
  const client = new OpenAiClient({ fetch: input.fetch });
  let accumulated = "";
  let usage: { model?: string; inputTokens?: number; outputTokens?: number } =
    {};

  try {
    for await (const event of client.createStreaming({
      operation: "buddy_turn",
      instructions: prompt.instructions,
      input: prompt.input,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })) {
      if (event.type === "delta") {
        accumulated += event.text;
        yield { type: "delta", text: event.text };
      } else {
        usage = {
          model: event.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
        };
      }
    }
  } catch (error) {
    const reason = providerReason(error);
    await persistReply({
      text: accumulated,
      factIds: [],
      status: "failed",
      reason,
    });
    logEvent("warn", "buddy_turn", {
      requestId: input.requestId,
      route: routeLabel,
      status: "failed",
      reason,
      latencyMs: Date.now() - startedAt,
    });
    yield { type: "done", ok: false, prose: "", factIds: [], reason };
    return;
  }

  const parsed = parseBuddyReply(accumulated, {
    allowedFactIds: prompt.allowedFactIds,
    allowedPickIds: prompt.allowedPickIds,
    factAliases: prompt.factAliases,
  });

  await persistReply(
    parsed.ok
      ? {
          text: parsed.prose,
          factIds: parsed.factIds,
          pickId: parsed.pickId,
          status: "ok",
        }
      : {
          text: accumulated,
          factIds: [],
          status: "rejected",
          reason: parsed.reason,
        },
  );

  if (parsed.ok && parsed.note) {
    await saveNote(parsed.note);
  }

  logEvent("info", "buddy_turn", {
    requestId: input.requestId,
    route: routeLabel,
    status: parsed.ok ? "ok" : "rejected",
    reason: parsed.ok ? undefined : parsed.reason,
    latencyMs: Date.now() - startedAt,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    model: usage.model,
    estimatedCostMicros: usage.model
      ? estimateCostMicros(usage.model, usage.inputTokens, usage.outputTokens)
      : undefined,
  });

  yield parsed.ok
    ? {
        type: "done",
        ok: true,
        prose: parsed.prose,
        factIds: parsed.factIds,
        pickId: parsed.pickId,
        draft:
          parsed.draft && prompt.draftGroupId
            ? { groupId: prompt.draftGroupId, text: parsed.draft }
            : undefined,
        quota: claim.allowed
          ? {
              remaining: claim.remaining,
              resetAt: claim.resetAt.toISOString(),
            }
          : undefined,
      }
    : {
        type: "done",
        ok: false,
        prose: "",
        factIds: [],
        reason: parsed.reason,
      };
}
