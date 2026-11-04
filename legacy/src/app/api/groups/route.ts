import { NextRequest } from "next/server";
import { createGroup } from "@/data/groups";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { groupCreateSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const context = createRouteContext("POST /api/groups");

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
      : apiFailure("unauthenticated", "Sign in to create a group.", context);
  }

  const body = await readJsonBody(request, groupCreateSchema);
  if (!body.ok) {
    return apiFailure("invalid_request", "Enter a group name.", context);
  }

  const group = await createGroup({
    userId: account.userId,
    name: body.data.name,
  });
  return apiSuccess({ group }, context, { status: 201 });
}
