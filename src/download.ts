import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { DEFAULT_RETRIES, DEFAULT_RETRY_BASE_MS } from './constants';
import { PermanentError } from './errors';

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  name?: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A 404 from tool-cache surfaces as an HTTPError with httpStatusCode. */
function isPermanent(err: unknown): boolean {
  if (err instanceof PermanentError) {
    return true;
  }
  const status = (err as { httpStatusCode?: number })?.httpStatusCode;
  return status === 404;
}

/**
 * Run an async operation with exponential backoff (FR-4). Permanent errors
 * (404 / checksum mismatch) bail out immediately without retrying.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseMs = opts.baseMs ?? DEFAULT_RETRY_BASE_MS;
  const name = opts.name ?? 'operation';

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt > retries || isPermanent(err)) {
        break;
      }
      const delay = baseMs * 2 ** (attempt - 1);
      core.warning(
        `${name} failed (attempt ${attempt}/${retries + 1}): ${message(err)}. ` +
          `Retrying in ${delay}ms...`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Download a release asset to a temp file. When a token is available the
 * request is authenticated, which avoids unauthenticated rate-limit failures
 * (FR-3).
 */
export async function downloadAsset(url: string, token?: string): Promise<string> {
  const auth = token ? `Bearer ${token}` : undefined;
  return tc.downloadTool(url, undefined, auth);
}
