import { NextRequest } from "next/server";
import { z } from "zod";
import { hashClientAddress } from "@/data/briefings-repository";
import { forgetBuddySession, prepareBuddyTurn } from "@/data/buddy";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import type { RouteContext } from "@/lib/api-response";
import { MAX_QUESTION_CHARS } from "@/lib/buddy-prompt";
import { MAX_REPLY_CHARS } from "@/lib/buddy-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The SSR placeholder anonymousId, exactly as rejected in the briefings
// route: an unhydrated render must never be able to consume quota.
const SSR_PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

const turnSchema = z.object({
  role: z.enum(["user", "buddy"]),
  text: z.string().trim().min(1).max(MAX_REPLY_CHARS),
});

const bodySchema = z.object({
  conversation: z.uuid(),
  sessionId: z.uuid().refine((id) => id !== SSR_PLACEHOLDER_ID),
  route: z.string().trim().min(1).max(160),
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  history: z.array(turnSchema).max(6).default([]),
});

function invalid(context: RouteContext) {
  return apiFailure(
    "invalid_request",
    "Send a conversation and session ID, the current route, and a question of at most 500 characters.",
    context,
  );
}

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  return (
    forwarded?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"
  );
}

function sseStream(run: () => AsyncGenerator<{ type: string }>) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of run()) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              ok: false,
              prose: "",
              factIds: [],
              reason: "provider_unavailable",
            })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request: NextRequest) {
  const context = createRouteContext("POST /api/buddy");

  if (!isSameOrigin(request)) {
    return apiFailure(
      "forbidden",
      "Cross-origin requests are not allowed.",
      context,
    );
  }

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return invalid(context);

  const account = await requireAccount();
  const userId = account.ok ? account.userId : undefined;

  const preflight = await prepareBuddyTurn({
    conversation: body.data.conversation,
    route: body.data.route,
    question: body.data.question,
    history: body.data.history,
    userId,
    sessionId: body.data.sessionId,
    clientAddressHash: hashClientAddress(clientAddress(request)),
    requestId: context.requestId,
  });

  if (preflight.status === "quota_exceeded") {
    return apiFailure(
      "quota_exceeded",
      `The daily buddy limit has been reached. It resets at ${preflight.resetAt}.`,
      context,
    );
  }

  return new Response(sseStream(preflight.run), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}

const forgetSchema = z.object({
  sessionId: z.uuid().refine((id) => id !== SSR_PLACEHOLDER_ID),
});

/** "Forget what you know about me" — clears every note stored for this session. */
export async function DELETE(request: NextRequest) {
  const context = createRouteContext("DELETE /api/buddy");

  if (!isSameOrigin(request)) {
    return apiFailure(
      "forbidden",
      "Cross-origin requests are not allowed.",
      context,
    );
  }

  const body = await readJsonBody(request, forgetSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a session ID to forget.",
      context,
    );
  }

  await forgetBuddySession(body.data.sessionId);
  return apiSuccess({ forgotten: true }, context);
}
