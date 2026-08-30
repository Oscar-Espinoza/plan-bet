import { NextRequest } from "next/server";
import { postComment } from "@/data/game-comments";
import { readGameForWager } from "@/data/wagers-repository";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { gameCommentRequestSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ gameId: string }> };

/** `[gameId]` is the route id, the same shape the page itself is served at —
 * resolved to the canonical id here, never accepted from the client. */
export async function POST(request: NextRequest, { params }: Params) {
  const context = createRouteContext("POST /api/games/[gameId]/comments");

  if (!isSameOrigin(request)) {
    return apiFailure(
      "forbidden",
      "Cross-origin requests are not allowed.",
      context,
    );
  }

  const account = await requireAccount();
  if (!account.ok) {
    return account.reason === "unconfigured"
      ? apiFailure("service_unavailable", "Sign-in is not configured.", context)
      : apiFailure("unauthenticated", "Sign in to comment.", context);
  }

  const body = await readJsonBody(request, gameCommentRequestSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a groupId and a comment of 1 to 280 characters.",
      context,
    );
  }

  const { gameId } = await params;
  const game = await readGameForWager(gameId);
  if (!game) {
    return apiFailure(
      "not_found",
      "The requested game was not found.",
      context,
    );
  }

  const outcome = await postComment({
    userId: account.userId,
    actorName: account.name,
    groupId: body.data.groupId,
    canonicalGameId: game.canonicalId,
    body: body.data.body,
    now: new Date(),
  });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case "not_eligible":
        return apiFailure(
          "forbidden",
          "You need a wager in this group on this game to comment.",
          context,
        );
      case "already_commented":
        return apiFailure(
          "invalid_request",
          "You've already commented for this side of kickoff.",
          context,
        );
      case "unavailable":
        return apiFailure(
          "not_found",
          "The requested game was not found.",
          context,
        );
    }
  }

  return apiSuccess({ comment: outcome.comment }, context, { status: 201 });
}
