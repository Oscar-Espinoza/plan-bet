import { env } from "cloudflare:workers";
import { getRequestEvent } from "$app/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import type { RequestEvent } from "@sveltejs/kit";
import {
  configuredProviderNames,
  isAuthConfigured,
  isTrustedProviderEmail,
} from "./auth-config";
import { getDatabase } from "./db/client";
import * as schema from "./db/schema";

export { configuredProviderNames, isAuthConfigured };

export type AccountResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
      name: string | null;
      image: string | null;
    }
  | { ok: false; reason: "unconfigured" | "unauthenticated" };

function envString(name: string): string | undefined {
  const bindings = env as unknown as Record<string, string | undefined>;
  const fromBinding = bindings[name]?.trim();
  if (fromBinding) return fromBinding;
  return process.env[name]?.trim();
}

function siteBaseUrl(): string {
  const configured = envString("PUBLIC_SITE_URL");
  if (configured && !configured.includes("<")) {
    return configured.replace(/\/+$/, "");
  }
  return "http://localhost:8787";
}

function profileDisplayName(profile: {
  name?: string | null;
  email?: string | null;
  given_name?: string | null;
  login?: string | null;
}): string {
  const direct =
    profile.name?.trim() ||
    profile.given_name?.trim() ||
    profile.login?.trim() ||
    "";
  if (direct) return direct;
  const email = profile.email?.trim();
  if (email?.includes("@")) return email.split("@")[0] ?? "User";
  return "User";
}

function buildSocialProviders() {
  const providers: NonNullable<
    Parameters<typeof betterAuth>[0]["socialProviders"]
  > = {};
  const githubId = envString("AUTH_GITHUB_ID");
  const githubSecret = envString("AUTH_GITHUB_SECRET");
  if (githubId && githubSecret) {
    providers.github = {
      clientId: githubId,
      clientSecret: githubSecret,
      mapProfileToUser: (profile) => ({
        name: profileDisplayName(profile),
      }),
    };
  }
  const googleId = envString("AUTH_GOOGLE_ID");
  const googleSecret = envString("AUTH_GOOGLE_SECRET");
  if (googleId && googleSecret) {
    providers.google = {
      clientId: googleId,
      clientSecret: googleSecret,
      mapProfileToUser: (profile) => ({
        name: profileDisplayName(profile),
      }),
    };
  }
  return providers;
}

function createAuth() {
  const secret = envString("BETTER_AUTH_SECRET");
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not configured");

  return betterAuth({
    secret,
    baseURL: siteBaseUrl(),
    database: drizzleAdapter(getDatabase(), {
      provider: "sqlite",
      schema,
    }),
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 300,
        strategy: "compact",
        // Changing the database must also invalidate cached local sessions.
        version: envString("BETTER_AUTH_COOKIE_CACHE_VERSION") ?? "1",
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "github"],
      },
    },
    socialProviders: buildSocialProviders(),
    user: {
      /**
       * Runs before OAuth user/account provisioning (Better Auth
       * `user.validateUserInfo`; see /docs/concepts/users-accounts).
       */
      validateUserInfo: async (data) => {
        const providerId = data.source.oauth?.providerId;
        if (providerId === "google") {
          const profile = data.source.oauth?.profile as
            { email_verified?: unknown } | undefined;
          if (!isTrustedProviderEmail("google", profile)) {
            return { error: "AccessDenied" };
          }
        }
      },
    },
    plugins: [sveltekitCookies(getRequestEvent)],
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (!isAuthConfigured()) throw new Error("Auth is not configured");
  authInstance ??= createAuth();
  return authInstance;
}

/** Reads `locals.user` only; never calls Better Auth when unconfigured. */
export function requireAccount(event: RequestEvent): AccountResult {
  if (!isAuthConfigured()) return { ok: false, reason: "unconfigured" };
  const user = event.locals.user;
  if (!user?.id) return { ok: false, reason: "unauthenticated" };
  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
  };
}
