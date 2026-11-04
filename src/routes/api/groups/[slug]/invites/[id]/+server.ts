import type { RequestHandler } from "./$types";
import { isSameOrigin } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { revokeInvite } from "#lib/server/data/groups";
import { getGroupBySlug } from "#lib/server/data/groups-repository";

export const DELETE: RequestHandler = async (event) => {
  const context = createRouteContext("DELETE /api/groups/[slug]/invites/[id]");

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
      : apiFailure("unauthenticated", "Sign in to revoke an invite.", context);
  }

  const group = await getGroupBySlug(event.params.slug);
  if (!group) {
    return apiFailure("not_found", "That group does not exist.", context);
  }

  const outcome = await revokeInvite({
    inviteId: event.params.id,
    groupId: group.id,
    userId: account.userId,
  });
  if (!outcome.ok) {
    return apiFailure(
      "forbidden",
      "You are not a member of this group.",
      context,
    );
  }

  return apiSuccess({ revoked: true }, context);
};
