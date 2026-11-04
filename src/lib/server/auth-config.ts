import { env } from "cloudflare:workers";
import { isDatabaseConfigured } from "./db/client";

function envSecret(name: string): string | undefined {
  const bindings = env as unknown as Record<string, string | undefined>;
  const fromBinding = bindings[name]?.trim();
  if (fromBinding) return fromBinding;
  return process.env[name]?.trim();
}

/**
 * Empty unless sign-in as a whole is configured: provider credentials alone
 * cannot sign anyone in without BETTER_AUTH_SECRET and a database to hold the
 * session.
 */
export function configuredProviderNames(): Array<"github" | "google"> {
  if (!envSecret("BETTER_AUTH_SECRET") || !isDatabaseConfigured()) return [];
  const names: Array<"github" | "google"> = [];
  if (envSecret("AUTH_GITHUB_ID") && envSecret("AUTH_GITHUB_SECRET")) {
    names.push("github");
  }
  if (envSecret("AUTH_GOOGLE_ID") && envSecret("AUTH_GOOGLE_SECRET")) {
    names.push("google");
  }
  return names;
}

/** Spec §3.8: secret, at least one OAuth provider, and the D1 binding. */
export function isAuthConfigured(): boolean {
  return configuredProviderNames().length > 0;
}

/**
 * Both providers link on a shared email, which is only as safe as the
 * provider's claim that the user actually owns that address. Google states it
 * outright in the ID token, so require the claim rather than assume it.
 */
export function isTrustedProviderEmail(
  provider: string,
  profile: { email_verified?: unknown } | null | undefined,
): boolean {
  if (provider !== "google") return true;
  return profile?.email_verified === true;
}
