import { env } from "cloudflare:workers";
import { isDatabaseConfigured } from "./db/client";

/** Mirrors legacy auth-config for provider health; Better Auth wiring is T07. */
export function isAuthConfigured() {
  return Boolean(env.BETTER_AUTH_SECRET?.trim()) && isDatabaseConfigured();
}
