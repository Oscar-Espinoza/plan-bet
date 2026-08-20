import { NextRequest } from "next/server";
import { z } from "zod";
import { resetBankroll } from "@/data/credits";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({}).strict();

export async function POST(request: NextRequest) {
  const context = createRouteContext("POST /api/bets/reset");

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
          "Sign in to reset your bankroll.",
          context,
        );
  }

  const body = await readJsonBody(request, bodySchema);
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
}
