import { env } from "cloudflare:workers";

/** Worker secrets and vars are on `env`; keep `process.env` for local tooling. */
export function providerEnv(name: string): string | undefined {
  const bindings = env as unknown as Record<string, string | undefined>;
  const fromBinding = bindings[name]?.trim();
  if (fromBinding) return fromBinding;
  return process.env[name]?.trim();
}
