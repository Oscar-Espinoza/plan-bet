import { NextRequest } from "next/server";
import { castVote } from "@/data/game-comments";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { commentVoteRequestSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ commentId: string }> };

/** The comment id carries its own group and game, so the client supplies
 * neither — and supplies no side, no selection and no tally. Every fact
 * `castVote` grades on is re-derived server-side from `commentId` alone. */
export async function POST(request: NextRequest, { params }: Params) {
  const context = createRouteContext("POST /api/comments/[commentId]/votes");

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
      : apiFailure("unauthenticated", "Sign in to vote.", context);
  }

  const body = await readJsonBody(request, commentVoteRequestSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a kind of shame or slander.",
      context,
    );
  }

  const { commentId } = await params;
  const outcome = await castVote({
    userId: account.userId,
    commentId,
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
}
