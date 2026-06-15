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
