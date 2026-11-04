import { NextRequest } from "next/server";
import { revokeInvite } from "@/data/groups";
import { getGroupBySlug } from "@/data/groups-repository";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; id: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
  const context = createRouteContext("DELETE /api/groups/[slug]/invites/[id]");

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
      : apiFailure("unauthenticated", "Sign in to revoke an invite.", context);
  }

  const { slug, id } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) {
    return apiFailure("not_found", "That group does not exist.", context);
  }

  const outcome = await revokeInvite({
    inviteId: id,
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
}
