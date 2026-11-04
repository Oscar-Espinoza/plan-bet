import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { createGroup } from "#lib/server/data/groups";
import { groupCreateSchema } from "#lib/server/domain/contracts";

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/groups");

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
      : apiFailure("unauthenticated", "Sign in to create a group.", context);
  }

  const body = await readJsonBody(event.request, groupCreateSchema);
  if (!body.ok) {
    return apiFailure("invalid_request", "Enter a group name.", context);
  }

  const group = await createGroup({
    userId: account.userId,
    name: body.data.name,
  });
  return apiSuccess({ group }, context, { status: 201 });
};
