import { timingSafeEqual } from "node:crypto";

/**
 * Shared by every /api/cron/* route. `timingSafeEqual` throws on length
 * mismatch, so length-check first and let both paths fall through to the
 * same 401 — never let the length check produce a different response than
 * the content check.
 */
export function isAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
