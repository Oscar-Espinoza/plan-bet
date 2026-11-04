import type { RequestHandler } from "./$types";
import { isSameOrigin } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { createJoinLink } from "#lib/server/data/groups";
import { getGroupBySlug } from "#lib/server/data/groups-repository";
import { appBaseUrl } from "#lib/server/email";

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/groups/[slug]/link");

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
          "Sign in to create a join link.",
          context,
        );
  }

  const group = await getGroupBySlug(event.params.slug);
  if (!group) {
    return apiFailure("not_found", "That group does not exist.", context);
  }

  const outcome = await createJoinLink({
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

  return apiSuccess(
    {
      url: `${appBaseUrl()}/groups/accept/${outcome.token}`,
      inviteId: outcome.invite.id,
    },
    context,
    { status: 201 },
  );
};
