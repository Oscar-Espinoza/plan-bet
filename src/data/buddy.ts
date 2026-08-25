import "server-only";

import { hashSessionId } from "@/data/briefings-repository";
import {
  claimBuddyTurn,
  deleteBuddyNotes,
  listBuddyNotes,
  recordBuddyReply,
  saveBuddyNote,
} from "@/data/buddy-repository";
import { listBoardContext } from "@/data/fixture-context-repository";
import {
  commentPhase,
  listCommentThreads,
  pickPins,
  type CommentThread,
} from "@/data/game-comments";
import {
  getGroupBySlug,
  getGroupLeaderboard,
  isGroupMember,
} from "@/data/groups-repository";
import { getGameDetail } from "@/data/sports-data";
import { getRecordSlices, readGameForWager } from "@/data/wagers-repository";
import { estimateCostMicros } from "@/lib/ai-cost";
import {
  buildBuddyInput,
  type BuddyContext,
  type BuddyInput,
  type BuddyTurn,
} from "@/lib/buddy-prompt";
import { parseBuddyReply } from "@/lib/buddy-validation";
import {
  gameSummarySchema,
  type EvidenceFact,
  type GroupLeaderboardEntry,
  type RecordSlices,
} from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import { marketsFor } from "@/lib/markets";
import { isDatabaseConfigured } from "@/db/client";
import { isOpenAiConfigured, OpenAiClient } from "@/providers/openai/client";
import { ProviderError } from "@/providers/provider-error";

export {
  BUDDY_IP_DAILY_LIMIT,
  BUDDY_SESSION_DAILY_LIMIT,
} from "@/data/buddy-repository";

/** "Forget what you know about me" — clears every note for this session. */
export async function forgetBuddySession(sessionId: string) {
  if (!isDatabaseConfigured()) return;
  await deleteBuddyNotes(hashSessionId(sessionId));
}

const MAX_OUTPUT_TOKENS = 500;

function fact(id: string, label: string, value: string) {
  return {
    id,
    label,
    value,
    valueType: "text" as const,
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
// retrieval (pgvector + an embedding client — the design is in the phase
// plan) when the corpus outgrows a single prompt: more teams tracked, or
// finished fixtures kept around.
const RECALL_FIXTURES = 12;

/**
 * One fact per upcoming fixture that has context built — the board itself,
 * for a route with no game in scope. Pure, so it's unit-testable without a
 * database. A row whose stored `GameSummary` doesn't parse is skipped, never
 * guessed at, the same rule `readFixtureContext` applies to stored facts.
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

/**
 * One fact per comment in a group's thread on this game, plus the two pins
 * when they exist — what turns "a take about the fixture" into material for
 * a take addressed to the group. Pure, so it's unit-testable without a
 * database, same rule as `boardFacts`: skip, don't guess.
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
    // Stored fixture context already reached the snapshot in `getGameDetail`,
    // so the buddy cites exactly what the page displays beside it.
    const facts = [...detail.snapshot.evidenceFacts];
    let draft: { groupId: string } | undefined;
    if (viewer.userId && isDatabaseConfigured()) {
      // The same lookup `POST /api/games/[gameId]/comments` already makes to
      // resolve a route id to the canonical one — never a canonical id
      // accepted from the client.
      const game = await readGameForWager(routeId).catch(() => undefined);
      if (game) {
        // Degrades rather than throws, the same rule the recall arm and
        // `listBuddyNotes` already follow: a database blip costs the buddy
        // the thread, never the whole turn.
        const threads = await listCommentThreads(
          viewer.userId,
          game.canonicalId,
        ).catch(() => [] as CommentThread[]);
        // ponytail: only the first eligible thread. A reader in two groups
        // on the same game drafts for the first; widen when someone
        // actually has two.
        const thread = threads[0];
        if (thread) {
          facts.push(...threadFacts(thread));
          const phase = commentPhase(game.summary.scheduledAt, new Date());
          const hasCommented = thread.comments.some(
            (comment) =>
              comment.userId === viewer.userId && comment.phase === phase,
          );
          if (!hasCommented) draft = { groupId: thread.groupId };
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

  // Every other route: the board itself. `none` is now the *empty* case of
  // recall — no database, nothing built yet — rather than a route category.
  if (!isDatabaseConfigured()) return none;
  const rows = await listBoardContext({ limit: RECALL_FIXTURES }).catch(
    () => [],
  );
  const facts = boardFacts(rows);
  if (facts.length === 0) return none;
  return { context: { kind: "recall", facts }, routeLabel: "recall" };
}

/** No model call: labelled plainly, one line per fact, and never leans. */
function deterministicReply(context: BuddyContext) {
  if (context.kind === "none" || context.facts.length === 0) {
    return {
      prose:
        "AI isn't configured on this deployment, so I can't put together a take here. Check the board for the schedule instead.",
      factIds: [] as string[],
    };
  }
  const lines = context.facts.map(
    (item) =>
      `${item.label}: ${item.valueType === "datetime" ? "see this page for the exact time" : item.value} [${item.id}]`,
  );
  return {
    prose: `AI isn't configured on this deployment, so here's the evidence plainly, with no lean — ${lines.join(" ")}`,
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
  conversation: string;
  route: string;
  question: string;
  history: BuddyTurn[];
  userId?: string;
  sessionId: string;
  clientAddressHash: string;
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
 * even starts, not mid-stream — claiming the daily quota. Returns a thunk
 * rather than the generator itself so the route can decide up front whether
 * to open an SSE body or return the ordinary JSON error envelope.
 */
export async function prepareBuddyTurn(
  input: TurnInput,
): Promise<BuddyPreflight> {
  const now = input.now ?? new Date();
  const { context, routeLabel } = await resolveContext(input.route, {
    userId: input.userId,
  });
  const dbConfigured = isDatabaseConfigured();
  const sessionHash = hashSessionId(input.sessionId);
  const notes = dbConfigured
    ? await listBuddyNotes(sessionHash).catch(() => [] as string[])
    : [];
  const prompt = buildBuddyInput({
    context,
    history: input.history,
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
    if (!dbConfigured) return;
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

  if (!isOpenAiConfigured()) {
    return {
      status: "ready",
      run: () => streamFallback(context, routeLabel, input, persistReply),
    };
  }

  if (!dbConfigured) {
    return {
      status: "ready",
      run: () =>
        streamLive(
          prompt,
          routeLabel,
          input,
          persistReply,
          undefined,
          saveNote,
        ),
    };
  }

  let claim: Awaited<ReturnType<typeof claimBuddyTurn>> | undefined;
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
    claim = undefined;
  }

  if (claim && !claim.allowed) {
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
): AsyncGenerator<BuddyStreamEvent> {
  const fallback = deterministicReply(context);
  await persistReply({
    text: fallback.prose,
    factIds: fallback.factIds,
    status: "ok",
    reason: "ai_unconfigured",
  });
  logEvent("info", "buddy_turn", {
    requestId: input.requestId,
    route: routeLabel,
    status: "fallback",
    reason: "ai_unconfigured",
  });
  yield { type: "delta", text: fallback.prose };
  yield {
    type: "done",
    ok: true,
    prose: fallback.prose,
    factIds: fallback.factIds,
    reason: "ai_unconfigured",
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
  claim: Awaited<ReturnType<typeof claimBuddyTurn>> | undefined,
  saveNote: (note: string) => Promise<void>,
): AsyncGenerator<BuddyStreamEvent> {
  const startedAt = Date.now();
  const client = new OpenAiClient({ fetch: input.fetch });
  let accumulated = "";
  let usage: { inputTokens?: number; outputTokens?: number } = {};

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
    estimatedCostMicros: estimateCostMicros(
      usage.inputTokens,
      usage.outputTokens,
    ),
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
        quota: claim?.allowed
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
