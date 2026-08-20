import { NextRequest } from "next/server";
import { handlers, isAuthConfigured } from "@/lib/auth";
import { apiFailure, createRouteContext } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Thin wrappers rather than a bare `export const { GET, POST } = handlers`,
// so an unconfigured deploy answers honestly instead of throwing.
export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) {
    return apiFailure(
      "service_unavailable",
      "Sign-in is not configured.",
      createRouteContext("GET /api/auth"),
    );
  }
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) {
    return apiFailure(
      "service_unavailable",
      "Sign-in is not configured.",
      createRouteContext("POST /api/auth"),
    );
  }
  return handlers.POST(request);
}
