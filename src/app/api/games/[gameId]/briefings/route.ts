import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateBriefing } from "@/data/briefings";
import { hashClientAddress } from "@/data/briefings-repository";
import {
  MAX_NOTE_CHARS,
  MAX_WATCHLIST_CHARS,
  MAX_WATCHLIST_ITEMS,
} from "@/lib/briefing-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
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

function invalid(requestId: string) {
  return NextResponse.json(
    {
      error: {
        code: "invalid_request",
        message:
          "Send an anonymous session ID, at most 10 watchlist entries of 280 characters, and a note of 2000 characters.",
        requestId,
      },
    },
    { status: 400 },
  );
}

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return (
    forwarded?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"
  );
}

export async function POST(request: NextRequest, { params }: Props) {
  const requestId = randomUUID();
  const gameId = (await params).gameId.trim();
  if (!gameId || gameId.length > 160) return invalid(requestId);

  // Bound the payload before parsing, so an oversized body never reaches Zod.
  let text: string;
  try {
    text = await request.text();
  } catch {
    return invalid(requestId);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return invalid(requestId);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text || "{}");
  } catch {
    return invalid(requestId);
  }

  const body = bodySchema.safeParse(payload);
  if (!body.success) return invalid(requestId);

  const outcome = await generateBriefing({
    gameId,
    sessionId: body.data.sessionId,
    clientAddressHash: hashClientAddress(clientAddress(request)),
    watchlist: body.data.watchlist,
    note: body.data.note,
    requestId,
  });

  if (outcome.status === "not_found") {
    return NextResponse.json(
      {
        error: {
          code: "not_found",
          message: "The requested game was not found.",
          requestId,
        },
      },
      { status: 404 },
    );
  }

  if (outcome.status === "quota_exceeded") {
    return NextResponse.json(
      {
        error: {
          code: "quota_exceeded",
          message: `The daily briefing limit has been reached. It resets at ${outcome.resetAt}.`,
          requestId,
        },
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    { data: outcome.result },
    { headers: { "Cache-Control": "no-store" } },
  );
}
