import { NextRequest } from "next/server";
import { getGroupBySlug, setNotifyOnActivity } from "@/data/groups-repository";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { groupNotifyRequestSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** Per-member email opt-out. Only ever changes the caller's own row. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const context = createRouteContext("PATCH /api/groups/[slug]/notifications");

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
          "Sign in to change notifications.",
          context,
        );
  }

  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) {
    return apiFailure("not_found", "That group does not exist.", context);
  }

  const body = await readJsonBody(request, groupNotifyRequestSchema);
  if (!body.ok) {
    return apiFailure("invalid_request", "Send a boolean setting.", context);
  }

  // A non-member updates no rows, which is the membership check.
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
}
