import { NextRequest } from "next/server";
import { notifyGroupInvite } from "@/data/group-notifications";
import { getGroupBySlug } from "@/data/groups-repository";
import { inviteToGroup } from "@/data/groups";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { groupInviteRequestSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const context = createRouteContext("POST /api/groups/[slug]/invite");

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
      : apiFailure("unauthenticated", "Sign in to invite someone.", context);
  }

  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) {
    return apiFailure("not_found", "That group does not exist.", context);
  }

  const body = await readJsonBody(request, groupInviteRequestSchema);
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

  // The token reaches the invitee by email only — the response carries the
  // invite record without it.
  const emailed = await notifyGroupInvite({
    email: outcome.invite.email,
    token: outcome.token,
    groupName: group.name,
    invitedByName: account.name,
  });

  return apiSuccess({ invite: outcome.invite, emailed }, context, {
    status: 201,
  });
}
