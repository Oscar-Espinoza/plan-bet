import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { acceptGroupInvite } from "#lib/server/data/groups";
import { groupAcceptRequestSchema } from "#lib/server/domain/contracts";

const REASON_MESSAGE = {
  not_found: "This invite link is no longer valid.",
  expired: "This invite has expired. Ask the group for a new one.",
  email_mismatch:
    "This invite was sent to a different email address than the one you're signed in with.",
} as const;

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/groups/accept");

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
      : apiFailure(
          "unauthenticated",
          "Sign in to accept this invite.",
          context,
        );
  }

  const body = await readJsonBody(event.request, groupAcceptRequestSchema);
  if (!body.ok) {
    return apiFailure("invalid_request", "A token is required.", context);
  }

  const outcome = await acceptGroupInvite({
    token: body.data.token,
    userId: account.userId,
    userEmail: account.email ?? "",
  });

  if (!outcome.ok) {
    const code =
      outcome.reason === "email_mismatch" ? "forbidden" : "not_found";
    return apiFailure(code, REASON_MESSAGE[outcome.reason], context);
  }

  return apiSuccess({ groupSlug: outcome.groupSlug }, context);
};
