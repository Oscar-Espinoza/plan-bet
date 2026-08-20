import "server-only";

import { isDatabaseConfigured } from "@/db/client";

// Split out of auth.ts so /providers/registry.ts (imported by nearly every
// page via sports-data.ts) can read auth configuration without pulling in
// next-auth itself: importing next-auth from that hot path breaks vitest's
// module resolution for next/server in this pnpm layout. auth.ts re-exports
// this for everyone else.
export function isAuthConfigured() {
  return Boolean(process.env.AUTH_SECRET?.trim()) && isDatabaseConfigured();
}

export function configuredProviderNames(): Array<"github" | "google"> {
  const names: Array<"github" | "google"> = [];
  if (
    process.env.AUTH_GITHUB_ID?.trim() &&
    process.env.AUTH_GITHUB_SECRET?.trim()
  ) {
    names.push("github");
  }
  if (
    process.env.AUTH_GOOGLE_ID?.trim() &&
    process.env.AUTH_GOOGLE_SECRET?.trim()
  ) {
    names.push("google");
  }
  return names;
}
