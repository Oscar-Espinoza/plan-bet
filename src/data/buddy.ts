import "server-only";

import { hashSessionId } from "@/data/briefings-repository";
import { claimBuddyTurn, recordBuddyReply } from "@/data/buddy-repository";
import {
  getGroupBySlug,
  getGroupLeaderboard,
  isGroupMember,
} from "@/data/groups-repository";
import { getGameDetail } from "@/data/sports-data";
import { getRecordSlices } from "@/data/wagers-repository";
import { estimateCostMicros } from "@/lib/ai-cost";
import {
  buildBuddyInput,
  type BuddyContext,
  type BuddyInput,
  type BuddyTurn,
} from "@/lib/buddy-prompt";
import { parseBuddyReply } from "@/lib/buddy-validation";
import type { GroupLeaderboardEntry, RecordSlices } from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import { marketsFor } from "@/lib/markets";
import { isDatabaseConfigured } from "@/db/client";
import { isOpenAiConfigured, OpenAiClient } from "@/providers/openai/client";
import { ProviderError } from "@/providers/provider-error";

export {
  BUDDY_IP_DAILY_LIMIT,
  BUDDY_SESSION_DAILY_LIMIT,
} from "@/data/buddy-repository";

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
    const detail = await getGameDetail(gameMatch[1]!);
    if (!detail) return none;
    return {
      context: {
        kind: "game",
        facts: detail.snapshot.evidenceFacts,
        allowedPickIds: marketsFor(detail.snapshot.game.sport).flatMap(
          (market) =>
            market.selections.map(
              (selection) => `${market.id}:${selection.id}`,
            ),
        ),
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

  return none;
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
  const prompt = buildBuddyInput({
    context,
    history: input.history,
    question: input.question,
  });
  const dbConfigured = isDatabaseConfigured();
  const sessionHash = hashSessionId(input.sessionId);

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

  if (!isOpenAiConfigured()) {
    return {
      status: "ready",
      run: () => streamFallback(context, routeLabel, input, persistReply),
    };
  }

  if (!dbConfigured) {
    return {
      status: "ready",
      run: () => streamLive(prompt, routeLabel, input, persistReply, undefined),
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
    run: () => streamLive(prompt, routeLabel, input, persistReply, claim),
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
