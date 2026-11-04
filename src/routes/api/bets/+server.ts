import { z } from "zod";
import type { RequestHandler } from "./$types";
import { isSameOrigin, readJsonBody } from "#lib/server/api-request";
import {
  apiFailure,
  apiSuccess,
  createRouteContext,
} from "#lib/server/api-response";
import { requireAccount } from "#lib/server/auth";
import { wagerPlacementSchema } from "#lib/server/domain/contracts";
import { placeWager } from "#lib/server/data/wagers";
import { listWagers } from "#lib/server/data/wagers-repository";
import { CLOSED_COPY, priceMovedCopy } from "#lib/shared/wager-copy";

const limitSchema = z.coerce.number().int().min(1).max(10).default(10);

export const POST: RequestHandler = async (event) => {
  const context = createRouteContext("POST /api/bets");

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
      : apiFailure("unauthenticated", "Sign in to place a wager.", context);
  }

  const body = await readJsonBody(event.request, wagerPlacementSchema);
  if (!body.ok) {
    return apiFailure(
      "invalid_request",
      "Send a valid market, selection, price, and stake.",
      context,
    );
  }

  const outcome = await placeWager({
    userId: account.userId,
    actorName: account.name,
    ...body.data,
  });

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
        return apiFailure("forbidden", CLOSED_COPY[outcome.status], context);
      case "price_moved":
        return apiFailure(
          "invalid_request",
          priceMovedCopy(outcome.price),
          context,
        );
      case "insufficient_balance":
        return apiFailure(
          "invalid_request",
          "That stake is more than your balance.",
          context,
        );
      case "not_a_group_member":
        return apiFailure(
          "forbidden",
          "You are not a member of that group.",
          context,
        );
    }
  }

  return apiSuccess(
    { wager: outcome.wager, summary: outcome.summary },
    context,
    { status: outcome.replayed ? 200 : 201 },
  );
};

export const GET: RequestHandler = async (event) => {
  const context = createRouteContext("GET /api/bets");

  const account = requireAccount(event);
  if (!account.ok) {
    return account.reason === "unconfigured"
      ? apiFailure("service_unavailable", "Sign-in is not configured.", context)
      : apiFailure("unauthenticated", "Sign in to view your wagers.", context);
  }

  const limit = limitSchema.safeParse(
    event.url.searchParams.get("limit") ?? undefined,
  );
  if (!limit.success) {
    return apiFailure("invalid_request", "Use a limit from 1 to 10.", context);
  }

  return apiSuccess(await listWagers(account.userId, limit.data), context);
};
