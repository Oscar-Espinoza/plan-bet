import "server-only";

import { randomUUID } from "node:crypto";
import {
  claimBriefingSlot,
  completeBriefingRun,
  hashSessionId,
  utcDayEnd,
} from "@/data/briefings-repository";
import { getGameDetail } from "@/data/sports-data";
import {
  buildBriefingInput,
  getPromptVersion,
  getSchemaVersion,
} from "@/lib/briefing-prompt";
import {
  briefingJsonSchema,
  validateBriefingOutput,
  type BriefingValidationReason,
} from "@/lib/briefing-validation";
import {
  briefingSchema,
  type Briefing,
  type BriefingReason,
  type BriefingResult,
} from "@/lib/contracts";
import { estimateCostMicros } from "@/lib/ai-cost";
import { logEvent } from "@/lib/logger";
import { getTeam } from "@/lib/seed";
import { isDatabaseConfigured } from "@/db/client";
import {
  OpenAiClient,
  getOpenAiModel,
  isOpenAiConfigured,
} from "@/providers/openai/client";
import { ProviderError } from "@/providers/provider-error";

function logBriefing(
  mode: "live" | "fallback",
  details: Record<string, unknown>,
) {
  logEvent(mode === "live" ? "info" : "warn", "briefing_generation", {
    mode,
    ...details,
  });
}

function providerReason(error: unknown): BriefingReason {
  if (!(error instanceof ProviderError)) return "provider_unavailable";
  if (error.code === "timeout") return "provider_timeout";
  if (error.code === "rate_limited") return "provider_rate_limited";
  return "provider_unavailable";
}

const FALLBACK_LIMITATIONS: Record<BriefingReason, string> = {
  ai_unconfigured:
    "AI generation is not configured on this deployment, so this is the deterministic evidence brief.",
  validation_failed:
    "The generated briefing failed evidence validation twice, so the deterministic evidence brief was served instead.",
  provider_timeout:
    "The model did not respond in time, so the deterministic evidence brief was served instead.",
  provider_unavailable:
    "The model was unreachable, so the deterministic evidence brief was served instead.",
  provider_rate_limited:
    "The model rate limit was reached, so the deterministic evidence brief was served instead.",
};

/**
 * Carries the reason inside the briefing rather than beside it, so a reader who
 * reloads still sees why they are looking at the deterministic brief — the
 * browser store persists a Briefing and nothing else.
 */
function asFallback(briefing: Briefing, reason: BriefingReason): Briefing {
  return {
    ...briefing,
    mode: "fallback",
    limitations: [
      FALLBACK_LIMITATIONS[reason],
      ...briefing.limitations.filter(
        (limitation) => !limitation.includes("not live AI generation"),
      ),
    ],
  };
}

function auditFailed(
  requestId: string,
  operation: "claim_slot" | "complete_run",
  error: unknown,
) {
  // Never silent: a missing table or a dead database has to be visible in the
  // log for the request it happened on, not discovered a session later.
  logEvent("warn", "briefing_audit_failed", {
    requestId,
    operation,
    errorCode:
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "persistence_error",
  });
}

export type GenerateBriefingInput = {
  gameId: string;
  sessionId: string;
  clientAddressHash: string;
  watchlist: string[];
  note?: string;
  requestId: string;
  now?: Date;
  /** Test seam: an injected fetch reaches the OpenAI client unchanged. */
  fetch?: typeof globalThis.fetch;
};

export type GenerateBriefingOutcome =
  | { status: "ok"; result: BriefingResult }
  | { status: "not_found" }
  | { status: "quota_exceeded"; resetAt: string };

export async function generateBriefing(
  input: GenerateBriefingInput,
): Promise<GenerateBriefingOutcome> {
  const now = input.now ?? new Date();
  const detail = await getGameDetail(input.gameId, {
    now,
    requestId: input.requestId,
  });
  if (!detail) return { status: "not_found" };

  const { snapshot } = detail;
  const team = getTeam(snapshot.game.teamSlug)!;

  if (!isOpenAiConfigured()) {
    logBriefing("fallback", {
      requestId: input.requestId,
      reason: "ai_unconfigured",
    });
    return {
      status: "ok",
      result: {
        briefing: asFallback(detail.briefing, "ai_unconfigured"),
        mode: "fallback",
        reason: "ai_unconfigured",
      },
    };
  }

  const prompt = buildBriefingInput({
    snapshot,
    team,
    watchlist: input.watchlist,
    note: input.note,
  });
  const model = getOpenAiModel();
  const promptVersion = getPromptVersion();
  const schemaVersion = getSchemaVersion();

  let slot: Awaited<ReturnType<typeof claimBriefingSlot>> | undefined;
  if (isDatabaseConfigured()) {
    try {
      slot = await claimBriefingSlot({
        routeId: snapshot.game.id,
        sport: snapshot.game.sport,
        sessionHash: hashSessionId(input.sessionId),
        ipHash: input.clientAddressHash,
        model,
        promptVersion,
        schemaVersion,
        inputHash: prompt.inputHash,
        snapshotObservedAt: new Date(snapshot.freshness.sourceObservedAt),
        requestId: input.requestId,
        now,
      });
    } catch (error) {
      // A database outage must not block generation; it only costs the audit row.
      auditFailed(input.requestId, "claim_slot", error);
      slot = undefined;
    }
    if (slot && !slot.allowed) {
      return { status: "quota_exceeded", resetAt: slot.resetAt.toISOString() };
    }
  }

  const quota = slot?.allowed
    ? { remaining: slot.remaining, resetAt: slot.resetAt.toISOString() }
    : undefined;

  const finish = async (details: {
    status: "succeeded" | "failed";
    mode: "live" | "fallback";
    validationStatus: string;
    attemptCount: number;
    inputTokens?: number;
    outputTokens?: number;
    errorCode?: string;
    output?: Briefing;
  }) => {
    if (!slot?.allowed) return;
    try {
      await completeBriefingRun({
        id: slot.id,
        startedAt: slot.startedAt,
        estimatedCostMicros: estimateCostMicros(
          details.inputTokens,
          details.outputTokens,
        ),
        ...details,
      });
    } catch (error) {
      // An audit write failure must never lose the briefing the caller is owed.
      auditFailed(input.requestId, "complete_run", error);
    }
  };

  const client = new OpenAiClient({ fetch: input.fetch, model });
  const evidenceIds = prompt.facts.map((fact) => fact.id);
  const datetimeIds = prompt.facts
    .filter((fact) => fact.valueType === "datetime")
    .map((fact) => fact.id);
  const schema = briefingJsonSchema(
    snapshot.game.sport,
    evidenceIds,
    datetimeIds,
  );
  const startedAt = Date.now();

  let attemptCount = 0;
  let lastReason: BriefingValidationReason | undefined;
  let usage: { inputTokens?: number; outputTokens?: number } = {};

  // Validation gets exactly one repair retry, never a third call.
  for (const repair of [false, true]) {
    attemptCount += 1;
    let completion;
    try {
      completion = await client.createStructured({
        operation: "briefing_generation",
        instructions: repair
          ? `${prompt.instructions}\n\nYour previous answer was rejected by the check "${lastReason}". Fix only that problem. Cite exclusively these evidence IDs: ${evidenceIds.join(", ")}.`
          : prompt.instructions,
        input: prompt.input,
        schema,
      });
    } catch (error) {
      const reason = providerReason(error);
      const errorCode =
        error instanceof ProviderError ? error.code : "unavailable";
      await finish({
        status: "failed",
        mode: "fallback",
        validationStatus: reason,
        attemptCount,
        errorCode,
        ...usage,
      });
      logBriefing("fallback", {
        requestId: input.requestId,
        reason,
        errorCode,
        attemptCount,
        latencyMs: Date.now() - startedAt,
      });
      return {
        status: "ok",
        result: {
          briefing: asFallback(detail.briefing, reason),
          mode: "fallback",
          reason,
          quota,
        },
      };
    }

    usage = {
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
    };

    let raw: unknown;
    try {
      raw = JSON.parse(completion.text);
    } catch {
      raw = undefined;
    }

    const validation = validateBriefingOutput(raw, {
      evidenceIds,
      datetimeIds,
      sport: snapshot.game.sport,
    });

    if (validation.ok) {
      const latencyMs = Date.now() - startedAt;
      const briefing = briefingSchema.parse({
        gameId: snapshot.game.id,
        mode: "ai",
        summary: validation.output.summary,
        items: validation.output.items.map((item, index) => ({
          id: `${snapshot.game.id}-ai-${index + 1}`,
          category: item.category,
          text: item.text,
          // The model never saw the timestamp; it only named the fact. Resolving
          // it here is what lets the browser render it in the reader's zone.
          timestamp: item.timestampEvidenceId
            ? prompt.facts.find((fact) => fact.id === item.timestampEvidenceId)
                ?.value
            : undefined,
          evidenceIds: item.evidenceIds,
        })),
        limitations: validation.output.limitations,
        generatedAt: new Date(now.getTime()).toISOString(),
        generation: {
          model: completion.model,
          promptVersion,
          schemaVersion,
          latencyMs,
        },
      });
      await finish({
        status: "succeeded",
        mode: "live",
        validationStatus: "passed",
        attemptCount,
        output: briefing,
        ...usage,
      });
      logBriefing("live", {
        requestId: input.requestId,
        attemptCount,
        latencyMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      return { status: "ok", result: { briefing, mode: "live", quota } };
    }

    lastReason = validation.reason;
  }

  await finish({
    status: "failed",
    mode: "fallback",
    validationStatus: lastReason ?? "schema_invalid",
    attemptCount,
    errorCode: lastReason,
    ...usage,
  });
  logBriefing("fallback", {
    requestId: input.requestId,
    reason: "validation_failed",
    validationStatus: lastReason,
    attemptCount,
    latencyMs: Date.now() - startedAt,
  });
  return {
    status: "ok",
    result: {
      briefing: asFallback(detail.briefing, "validation_failed"),
      mode: "fallback",
      reason: "validation_failed",
      quota,
    },
  };
}

export function nextQuotaReset(now = new Date()) {
  return utcDayEnd(now).toISOString();
}

export function newRequestId() {
  return randomUUID();
}
