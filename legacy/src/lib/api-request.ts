import type { ZodType } from "zod";

const DEFAULT_CALLBACK_URL = "/you";
// Any origin works; it exists only so a relative path can be resolved and its
// origin compared. It is never rendered or navigated to.
const CALLBACK_BASE = "https://matchday.invalid";

/**
 * Browsers always send `Origin` on a POST, so a missing header means a
 * non-browser caller and gets the same rejection as a mismatched one.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * Only ever an on-site path. Let the URL parser decide, because a prefix check
 * cannot: the WHATWG spec folds backslashes into slashes and strips tabs and
 * newlines before resolving, so "/\\evil.com" and "/\tevil.com" both navigate
 * to evil.com while passing any startsWith("//") test.
 */
export function safeCallbackUrl(value: string | undefined): string {
  if (!value) return DEFAULT_CALLBACK_URL;
  try {
    const resolved = new URL(value, CALLBACK_BASE);
    if (resolved.origin !== CALLBACK_BASE) return DEFAULT_CALLBACK_URL;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
}

export type JsonBodyResult<T> = { ok: true; data: T } | { ok: false };

/**
 * Bounds the payload before parsing, so an oversized body never reaches Zod.
 * Every failure mode (unreadable body, oversized, malformed JSON, schema
 * mismatch) collapses to the same undetailed `{ ok: false }`.
 */
export async function readJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes = 64 * 1024,
): Promise<JsonBodyResult<T>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text || "{}");
  } catch {
    return { ok: false };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false };
  return { ok: true, data: parsed.data };
}
