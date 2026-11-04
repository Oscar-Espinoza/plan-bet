import { waitUntil } from "cloudflare:workers";
import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { notifyGroupInvite } from "#lib/server/data/group-notifications";
import { inviteToGroup } from "#lib/server/data/groups";
import { getGroupBySlug } from "#lib/server/data/groups-repository";
import { groupInviteRequestSchema } from "#lib/server/domain/contracts";
import { isEmailConfigured } from "#lib/server/email";
import { logEvent } from "#lib/server/logger";

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/groups/[slug]/invite");

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
      : apiFailure("unauthenticated", "Sign in to invite someone.", context);
  }

  const group = await getGroupBySlug(event.params.slug);
  if (!group) {
    return apiFailure("not_found", "That group does not exist.", context);
  }

  const body = await readJsonBody(event.request, groupInviteRequestSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Enter a valid email address.",
      context,
    );
  }

  const outcome = await inviteToGroup({
    groupId: group.id,
    invitedByUserId: account.userId,
    email: body.data.email,
  });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case "not_a_member":
        return apiFailure(
          "forbidden",
          "You are not a member of this group.",
          context,
        );
      case "already_member":
        return apiFailure(
          "invalid_request",
          "That email already belongs to a member.",
          context,
        );
    }
  }

  const emailed = isEmailConfigured();
  if (emailed) {
    const invite = {
      email: body.data.email,
      token: outcome.token,
      groupName: group.name,
      invitedByName: account.name,
    };
    waitUntil(
      notifyGroupInvite(invite).then(
        () => undefined,
        (error: unknown) => {
          logEvent("warn", "group_notification_failed", {
            trigger: "invite",
            error,
          });
        },
      ),
    );
  }

  return apiSuccess({ invite: outcome.invite, emailed }, context, {
    status: 201,
  });
};
