import { NextRequest } from "next/server";
import { z } from "zod";
import { listWagers } from "@/data/wagers-repository";
import { placeWager, type WagerClosedReason } from "@/data/wagers";
import { requireAccount } from "@/lib/auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-request";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";
import { wagerPlacementSchema } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOSED_MESSAGES: Record<WagerClosedReason, string> = {
  scheduled: "This game is not open for wagers.", // unreachable: scheduled is the open state
  started: "This game has already started.",
  live: "This game is already in progress.",
  finished: "This game has finished.",
  postponed: "This game has been postponed.",
  cancelled: "This game has been cancelled.",
  unknown: "This game is not open for wagers.",
};

const limitSchema = z.coerce.number().int().min(1).max(10).default(10);

export async function POST(request: NextRequest) {
  const context = createRouteContext("POST /api/bets");

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
      : apiFailure("unauthenticated", "Sign in to place a wager.", context);
  }

  const body = await readJsonBody(request, wagerPlacementSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a valid market, selection, price, and stake.",
      context,
    );
  }

  const outcome = await placeWager({ userId: account.userId, ...body.data });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case "invalid_selection":
        return apiFailure(
          "invalid_request",
          "That market or selection is not offered.",
          context,
        );
      case "unavailable":
        return apiFailure(
          "not_found",
          "This game is not available for wagers.",
          context,
        );
      case "closed":
        return apiFailure(
          "forbidden",
          CLOSED_MESSAGES[outcome.status],
          context,
        );
      case "price_moved":
        return apiFailure(
          "invalid_request",
          `The price is now ${outcome.price.toFixed(2)}. Review the slip and place again.`,
          context,
        );
      case "insufficient_balance":
        return apiFailure(
          "invalid_request",
          "That stake is more than your balance.",
          context,
        );
    }
  }

  return apiSuccess(
    { wager: outcome.wager, summary: outcome.summary },
    context,
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  const context = createRouteContext("GET /api/bets");

  const account = await requireAccount();
  if (!account.ok) {
    return account.reason === "unconfigured"
      ? apiFailure("service_unavailable", "Sign-in is not configured.", context)
      : apiFailure("unauthenticated", "Sign in to view your wagers.", context);
  }

  const limit = limitSchema.safeParse(
    request.nextUrl.searchParams.get("limit") ?? undefined,
  );
  if (!limit.success) {
    return apiFailure("invalid_request", "Use a limit from 1 to 10.", context);
  }

  return apiSuccess(await listWagers(account.userId, limit.data), context);
}
