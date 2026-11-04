import { z } from "zod";
import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
  type RouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { MAX_QUESTION_CHARS } from "#lib/server/buddy-prompt";
import { MAX_REPLY_CHARS } from "#lib/server/buddy-validation";
import { forgetBuddySession, prepareBuddyTurn } from "#lib/server/data/buddy";
import { hashClientAddress } from "#lib/server/data/buddy-repository";
import { requestLocale } from "#lib/shared/locale";
import { viewerZone } from "#lib/shared/utils";

// The SSR placeholder anonymousId, rejected outright: an unhydrated render
// must never be able to consume quota.
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
  // Display only — how a kickoff is written in the reply, never a fact.
  timeZone: z.string().max(64).optional(),
});

function invalid(context: RouteContext) {
  return apiFailure(
    "invalid_request",
    "Send a conversation and session ID, the current route, and a question of at most 500 characters.",
    context,
  );
}

function connectingIp(request: Request) {
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  return ip || null;
}

function requestTimeZone(request: Request, fromBody: string | undefined) {
  const cf = (request as Request & { cf?: { timezone?: string } }).cf;
  const fromCf = typeof cf?.timezone === "string" ? cf.timezone : undefined;
  return viewerZone(fromBody ?? fromCf);
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

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/buddy");

  if (!isSameOrigin(event.request)) {
    return apiFailure(
      "forbidden",
      "Cross-origin requests are not allowed.",
      context,
    );
  }

  const body = await readJsonBody(event.request, bodySchema);
  if (!body.ok) return invalid(context);

  const account = requireAccount(event);
  const userId = account.ok ? account.userId : undefined;
  const ip = connectingIp(event.request);

  const preflight = await prepareBuddyTurn({
    locale: requestLocale(
      event.cookies.get("locale"),
      event.request.headers.get("accept-language"),
    ),
    timeZone: requestTimeZone(event.request, body.data.timeZone),
    conversation: body.data.conversation,
    route: body.data.route,
    question: body.data.question,
    history: body.data.history,
    userId,
    sessionId: body.data.sessionId,
    clientAddressHash: ip ? hashClientAddress(ip) : null,
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
};

const forgetSchema = z.object({
  sessionId: z.uuid().refine((id) => id !== SSR_PLACEHOLDER_ID),
});

/** "Forget what you know about me" — clears every note stored for this session. */
export const DELETE: RequestHandler = async (event) => {
  const context = createRouteContext("DELETE /api/buddy");

  if (!isSameOrigin(event.request)) {
    return apiFailure(
      "forbidden",
      "Cross-origin requests are not allowed.",
      context,
    );
  }

  const body = await readJsonBody(event.request, forgetSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a session ID to forget.",
      context,
    );
  }

  await forgetBuddySession(body.data.sessionId);
  return apiSuccess({ forgotten: true }, context);
};
