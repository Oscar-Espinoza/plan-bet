import "server-only";

import { ZodError } from "zod";

export type ProviderErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_payload";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly operation: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}

export function providerErrorCode(error: unknown) {
  if (error instanceof ProviderError) return error.code;
  // A Zod failure is a payload the vendor changed, not a database problem —
  // the old catch-all reported both as "persistence_error", which named the
  // wrong subsystem in every path that only reads.
  if (error instanceof ZodError) return "invalid_payload";
  return "persistence_error";
}
