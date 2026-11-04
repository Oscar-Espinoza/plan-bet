import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import {
  getGroupBySlug,
  setNotifyOnActivity,
} from "#lib/server/data/groups-repository";
import { groupNotifyRequestSchema } from "#lib/server/domain/contracts";

export const PATCH: RequestHandler = async (event) => {
  const context = createRouteContext("PATCH /api/groups/[slug]/notifications");

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
          "Sign in to change notifications.",
          context,
        );
  }

  const group = await getGroupBySlug(event.params.slug);
  if (!group) {
    return apiFailure("not_found", "That group does not exist.", context);
  }

  const body = await readJsonBody(event.request, groupNotifyRequestSchema);
  if (!body.ok) {
    return apiFailure("invalid_request", "Send a boolean setting.", context);
  }

  const updated = await setNotifyOnActivity({
    groupId: group.id,
    userId: account.userId,
    notifyOnActivity: body.data.notifyOnActivity,
  });
  if (!updated) {
    return apiFailure(
      "forbidden",
      "You are not a member of this group.",
      context,
    );
  }

  return apiSuccess({ notifyOnActivity: body.data.notifyOnActivity }, context);
};
