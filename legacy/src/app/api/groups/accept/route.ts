import { NextRequest } from "next/server";
import { acceptGroupInvite } from "@/data/groups";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { groupAcceptRequestSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same copy the accept page showed inline before this became a confirmed
// POST rather than a mutation on GET (Phase C).
const REASON_MESSAGE = {
  not_found: "This invite link is no longer valid.",
  expired: "This invite has expired. Ask the group for a new one.",
  email_mismatch:
    "This invite was sent to a different email address than the one you're signed in with.",
} as const;

export async function POST(request: NextRequest) {
  const context = createRouteContext("POST /api/groups/accept");

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
          "Sign in to accept this invite.",
          context,
        );
  }

  const body = await readJsonBody(request, groupAcceptRequestSchema);
  if (!body.ok) {
    return apiFailure("invalid_request", "A token is required.", context);
  }

  // Link invites have no email to match, so an account with none on file
  // (account.email is null) still resolves cleanly — the mismatch check
  // inside acceptGroupInvite only ever fires for an email-targeted invite.
  const outcome = await acceptGroupInvite({
    token: body.data.token,
    userId: account.userId,
    userEmail: account.email ?? "",
  });

  if (!outcome.ok) {
    const code =
      outcome.reason === "email_mismatch" ? "forbidden" : "not_found";
    return apiFailure(code, REASON_MESSAGE[outcome.reason], context);
  }

  return apiSuccess({ groupSlug: outcome.groupSlug }, context);
}
