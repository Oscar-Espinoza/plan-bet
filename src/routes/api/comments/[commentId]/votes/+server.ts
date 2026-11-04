import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { castVote } from "#lib/server/data/game-comments";
import { commentVoteRequestSchema } from "#lib/server/domain/contracts";

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/comments/[commentId]/votes");

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
      : apiFailure("unauthenticated", "Sign in to vote.", context);
  }

  const body = await readJsonBody(event.request, commentVoteRequestSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a kind of shame or slander.",
      context,
    );
  }

  const outcome = await castVote({
    userId: account.userId,
    commentId: event.params.commentId,
    kind: body.data.kind,
  });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case "not_eligible":
        return apiFailure(
          "forbidden",
          "You can only pin a call from the other side.",
          context,
        );
      case "already_voted":
        return apiFailure(
          "invalid_request",
          "You've already cast this vote.",
          context,
        );
      case "unavailable":
        return apiFailure(
          "not_found",
          "The requested comment was not found.",
          context,
        );
    }
  }

  return apiSuccess({}, context, { status: 201 });
};
