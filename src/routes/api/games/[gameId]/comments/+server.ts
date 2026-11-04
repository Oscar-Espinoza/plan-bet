import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { postComment } from "#lib/server/data/game-comments";
import { readGameForWager } from "#lib/server/data/wagers-repository";
import { gameCommentRequestSchema } from "#lib/server/domain/contracts";

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/games/[gameId]/comments");

  if (!isSameOrigin(event.request)) {
    return apiFailure(
      "forbidden",
      "Cross-origin requests are not allowed.",
      context,
    );
  }

  const account = requireAccount(event);
  if (!account.ok) {
    return account.reason === "unconfigured"
      ? apiFailure("service_unavailable", "Sign-in is not configured.", context)
      : apiFailure("unauthenticated", "Sign in to comment.", context);
  }

  const body = await readJsonBody(event.request, gameCommentRequestSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a groupId and a comment of 1 to 280 characters.",
      context,
    );
  }

  const game = await readGameForWager(event.params.gameId);
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
    parentCommentId: body.data.parentCommentId,
    now: new Date(),
  });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case "invalid_parent":
        return apiFailure(
          "invalid_request",
          "That reply target is not available in this group and match.",
          context,
        );
      case "phase_closed":
        return apiFailure(
          "invalid_request",
          "Posting is closed. Your second message opens after full time.",
          context,
        );
      case "not_eligible":
        return apiFailure(
          "forbidden",
          "You need a wager in this group on this game to comment.",
          context,
        );
      case "already_commented":
        return apiFailure(
          "invalid_request",
          "You have already used your message for this phase.",
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
};
