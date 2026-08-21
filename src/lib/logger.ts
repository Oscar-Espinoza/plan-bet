export type LogLevel = "info" | "warn" | "error";

export const REDACTED = "[redacted]";

const DENYLIST = new Set([
  "authorization",
  "cookie",
  "apikey",
  "token",
  "secret",
  "password",
  "databaseurl",
  "url",
  "ip",
  "ipaddress",
  "note",
  "watchlist",
  "prompt",
  "output",
  "sessionid",
  "email",
  // The exact field names carried through briefings.ts, briefings-repository.ts,
  // and briefing_runs. They are hashes, so scrubSecrets cannot catch them.
  "sessionhash",
  "iphash",
  "inputhash",
  "clientaddresshash",
  // Auth.js session/OAuth fields, denylisted by normalized key so
  // session_token, sessionToken, access-token, etc. are all covered.
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "state",
  "codeverifier",
]);

const SECRET_ENV_VARS = [
  "DATABASE_URL",
  "FOOTBALL_DATA_API_TOKEN",
  "OPENAI_API_KEY",
  "RATE_LIMIT_HASH_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "AUTH_SECRET",
  "AUTH_GITHUB_SECRET",
  "AUTH_GOOGLE_SECRET",
] as const;

const MAX_DEPTH = 6;

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function scrubSecrets(value: string) {
  let scrubbed = value;
  for (const name of SECRET_ENV_VARS) {
    const secret = process.env[name]?.trim();
    if (!secret) continue;
    scrubbed = scrubbed.split(secret).join(REDACTED);
  }
  return scrubbed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function redactValue(
  value: unknown,
  depth: number,
  seen: Set<object>,
): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") return scrubSecrets(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol")
    return "[unserializable]";
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error)
    return { name: value.name, message: scrubSecrets(value.message) };
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value)) return "[circular]";

  if (Array.isArray(value)) {
    seen.add(value);
    const result = value.map((item) => redactValue(item, depth + 1, seen));
    seen.delete(value);
    return result;
  }

  if (!isPlainObject(value)) return "[unserializable]";

  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = DENYLIST.has(normalizeKey(key))
      ? REDACTED
      : redactValue(entry, depth + 1, seen);
  }
  seen.delete(value);
  return result;
}

export function redact(value: unknown): unknown {
  return redactValue(value, 0, new Set());
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}
