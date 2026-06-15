/**
 * Marks a failure that must NOT be retried (e.g. 404 = no such version/asset,
 * checksum mismatch). withRetry() bails out immediately on these (FR-4).
 */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

/** Coerce an unknown thrown value into a human-readable message string. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
