import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { DEFAULT_RETRIES, DEFAULT_RETRY_BASE_MS } from './constants';
import { errorMessage, PermanentError } from './errors';
import { assertRedirectTrusted } from './github';

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  name?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A 404 from tool-cache surfaces as an HTTPError with httpStatusCode. */
function isPermanent(err: unknown): boolean {
  if (err instanceof PermanentError) {
    return true;
  }
  const status = (err as { httpStatusCode?: number })?.httpStatusCode;
  return status === 404;
}

/**
 * Run an async operation with exponential backoff. Permanent errors
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
 * request is authenticated, which avoids unauthenticated rate-limit failures.
 */
export async function downloadAsset(url: string, token?: string): Promise<string> {
  // Vet the redirect chain's hosts before tool-cache (which follows redirects
  // opaquely) fetches the body. Only a PermanentError (untrusted host or
  // non-HTTPS URL) is fatal; a preflight that simply couldn't complete falls
  // through to the checksum-verified tool-cache download rather than blocking it.
  try {
    await assertRedirectTrusted(url, token);
  } catch (err) {
    if (err instanceof PermanentError) {
      throw err;
    }
    // "Couldn't run" = a failed fetch (TypeError) or a timeout (DOMException);
    // anything else is unexpected.
    const couldNotRun =
      err instanceof TypeError ||
      (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError'));
    if (!couldNotRun) {
      throw err;
    }
    core.debug(`Redirect preflight skipped (${errorMessage(err)}); proceeding to tool-cache.`);
  }
  // tool-cache's downloader exposes no AbortSignal/size limit, and we keep it for
  // its proxy support (#54); the binary transfer is bounded only by the job
  // timeout (hangs) and runner disk (size), and SHA256 verification
  // rejects a tampered payload before it is cached.
  const auth = token ? `Bearer ${token}` : undefined;
  return tc.downloadTool(url, undefined, auth);
}
