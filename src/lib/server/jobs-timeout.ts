export class JobsTimeoutError extends Error {
  constructor() {
    super("The jobs request timed out.");
    this.name = "JobsTimeoutError";
  }
}

/**
 * Stops waiting after `timeoutMs`. The original promise is still caught so a
 * late rejection does not surface as unhandled once the caller has moved on.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new JobsTimeoutError()), timeoutMs);
  });
  void promise.catch(() => undefined);
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
