import "server-only";

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
  return error instanceof ProviderError ? error.code : "persistence_error";
}
