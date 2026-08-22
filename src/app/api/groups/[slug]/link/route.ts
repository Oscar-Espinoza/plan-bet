import { NextRequest } from "next/server";
import { createJoinLink } from "@/data/groups";
import { getGroupBySlug } from "@/data/groups-repository";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { appBaseUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** Create-or-reuse: one live join link per group (see createJoinLink). */
export async function POST(request: NextRequest, { params }: Params) {
  const context = createRouteContext("POST /api/groups/[slug]/link");

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
      : apiFailure(
          "unauthenticated",
          "Sign in to create a join link.",
          context,
        );
  }

  const { slug } = await params;
  const group = await getGroupBySlug(slug);
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
}
