import { z } from "zod";
import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { resetBankroll } from "#lib/server/data/credits";

const bodySchema = z.object({}).strict();

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/bets/reset");

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
          "Sign in to reset your bankroll.",
          context,
        );
  }

  const body = await readJsonBody(event.request, bodySchema);
  if (!body.ok) {
    return apiFailure("invalid_request", "Send an empty JSON body.", context);
  }

  const outcome = await resetBankroll({ userId: account.userId });
  if (!outcome.ok) {
    return apiFailure(
      "quota_exceeded",
      "The bankroll reset limit has been reached. Try again later.",
      context,
    );
  }

  return apiSuccess(outcome.summary, context);
};
