export { Pool, types } from "pg";

export function neon() {
  throw new Error(
    "Local rehearsal uses a TCP pool. The Neon HTTP client is not used.",
  );
}
