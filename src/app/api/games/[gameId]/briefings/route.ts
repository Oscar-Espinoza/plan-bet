import { NextRequest } from "next/server";
import { z } from "zod";
import { generateBriefing } from "@/data/briefings";
import { hashClientAddress } from "@/data/briefings-repository";
import { readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import type { RouteContext } from "@/lib/api-response";
import {
  MAX_NOTE_CHARS,
  MAX_WATCHLIST_CHARS,
  MAX_WATCHLIST_ITEMS,
} from "@/lib/briefing-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SSR_PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

const bodySchema = z.object({
  sessionId: z.uuid().refine((id) => id !== SSR_PLACEHOLDER_ID),
  watchlist: z
    .array(z.string().trim().min(1).max(MAX_WATCHLIST_CHARS))
    .max(MAX_WATCHLIST_ITEMS)
    .default([]),
  note: z.string().trim().max(MAX_NOTE_CHARS).optional(),
});

type Props = { params: Promise<{ gameId: string }> };

function invalid(context: RouteContext) {
  return apiFailure(
    "invalid_request",
    "Send an anonymous session ID, at most 10 watchlist entries of 280 characters, and a note of 2000 characters.",
    context,
  );
}

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return (
    forwarded?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"
  );
}

export async function POST(request: NextRequest, { params }: Props) {
  const context = createRouteContext("POST /api/games/[gameId]/briefings");
  const gameId = (await params).gameId.trim();
  if (!gameId || gameId.length > 160) return invalid(context);

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return invalid(context);

  const outcome = await generateBriefing({
    gameId,
    sessionId: body.data.sessionId,
    clientAddressHash: hashClientAddress(clientAddress(request)),
    watchlist: body.data.watchlist,
    note: body.data.note,
    requestId: context.requestId,
  });

  if (outcome.status === "not_found") {
    return apiFailure(
      "not_found",
      "The requested game was not found.",
      context,
    );
  }

  if (outcome.status === "quota_exceeded") {
    return apiFailure(
      "quota_exceeded",
      `The daily briefing limit has been reached. It resets at ${outcome.resetAt}.`,
      context,
    );
  }

  return apiSuccess(outcome.result, context);
}
