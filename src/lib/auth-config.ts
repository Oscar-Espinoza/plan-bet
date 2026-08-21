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

/**
 * Empty unless sign-in as a whole is configured: provider credentials alone
 * cannot sign anyone in without AUTH_SECRET and a database to hold the
 * session, so listing a provider then would render buttons that can only fail.
 * Gated here rather than at the caller so /sign-in and the Auth.js config
 * cannot disagree about which providers exist.
 */
export function configuredProviderNames(): Array<"github" | "google"> {
  if (!isAuthConfigured()) return [];
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

/**
 * Both providers link on a shared email, which is only as safe as the
 * provider's claim that the user actually owns that address. Google states it
 * outright in the ID token, so require the claim rather than assume it.
 *
 * ponytail: GitHub is trusted on its own guarantee that a primary email is
 * verified, because @auth/core's github provider picks `emails.find(e =>
 * e.primary)` without testing `e.verified` and never surfaces that payload to
 * the signIn callback. Override the provider's `profile` to filter on
 * `e.primary && e.verified` if that guarantee ever stops holding.
 */
export function isTrustedProviderEmail(
  provider: string,
  profile: { email_verified?: unknown } | null | undefined,
): boolean {
  if (provider !== "google") return true;
  return profile?.email_verified === true;
}
