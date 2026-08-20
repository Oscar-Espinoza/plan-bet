import { getCreditSummary } from "@/data/credits";
import { requireAccount } from "@/lib/auth";
import { apiFailure, apiSuccess, createRouteContext } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const context = createRouteContext("GET /api/bets/summary");

  const account = await requireAccount();
  if (!account.ok) {
    return account.reason === "unconfigured"
      ? apiFailure("service_unavailable", "Sign-in is not configured.", context)
      : apiFailure("unauthenticated", "Sign in to view your balance.", context);
  }

  return apiSuccess(await getCreditSummary(account.userId), context);
}
