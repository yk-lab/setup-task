import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { DEFAULT_RETRIES, DEFAULT_RETRY_BASE_MS } from './constants';
import { PermanentError, errorMessage } from './errors';
import { assertRedirectTrusted } from './github';

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  name?: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
        `${name} failed (attempt ${attempt}/${retries + 1}): ${errorMessage(err)}. ` +
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
  // Vet the redirect chain's hosts before tool-cache (which follows redirects
  // opaquely) fetches the body (NFR-1). The preflight's global fetch ignores
  // runner proxy settings, so only an untrusted host (PermanentError) is fatal;
  // a network/proxy failure falls through to the proxy-capable, checksum-verified
  // tool-cache download.
  try {
    await assertRedirectTrusted(url, token);
  } catch (err) {
    if (err instanceof PermanentError) {
      throw err;
    }
    // Only a failed fetch (TypeError) is tolerated; anything else is unexpected.
    if (!(err instanceof TypeError)) {
      throw err;
    }
    core.debug(`Redirect preflight skipped (network/proxy failure): ${errorMessage(err)}`);
  }
  const auth = token ? `Bearer ${token}` : undefined;
  return tc.downloadTool(url, undefined, auth);
}
