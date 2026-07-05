import * as semver from 'semver';
import {
  GITHUB_API,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  REPO_NAME,
  REPO_OWNER,
  REQUEST_TIMEOUT_MS,
} from './constants';
import { PermanentError } from './errors';
import { fetch } from './fetch';
import { assertAllowedHost } from './url-guard';
import type { ReleaseApi } from './version';

interface ReleasePayload {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'setup-task-action',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Drop the Authorization header so the repo-token is never sent off-host. */
function withoutAuth(headers: Record<string, string>): Record<string, string> {
  const copy = { ...headers };
  delete copy.Authorization;
  delete copy.authorization;
  return copy;
}

/**
 * fetch() that follows redirects manually so every hop's host is validated
 * against the allowlist (NFR-1), and drops Authorization on a cross-origin
 * redirect so the repo-token never leaks off github.com.
 */
export async function secureFetch(url: string, headers: Record<string, string>): Promise<Response> {
  let currentUrl = url;
  let currentHeaders = headers;
  // One deadline for the whole operation — redirects plus the final body read
  // (the returned response's body stays bound to this signal). A hang aborts
  // and surfaces as a transient error withRetry can retry (NFR-1).
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedHost(currentUrl, 'request');
    const resp = await fetch(currentUrl, { headers: currentHeaders, redirect: 'manual', signal });

    if (!REDIRECT_STATUSES.has(resp.status)) {
      return resp;
    }

    // A missing/unparsable Location is malformed — treat as untrusted, not a
    // trusted terminal (else it could slip through the preflight fall-through).
    await resp.body?.cancel();
    const location = resp.headers.get('location');
    if (!location) {
      throw new PermanentError(`Redirect ${resp.status} without a Location from ${currentUrl}`);
    }
    let next: URL;
    try {
      next = new URL(location, currentUrl);
    } catch {
      throw new PermanentError(`Invalid redirect Location from ${currentUrl}: ${location}`);
    }

    // Drop auth when the next hop crosses origins.
    if (next.origin !== new URL(currentUrl).origin) {
      currentHeaders = withoutAuth(currentHeaders);
    }
    currentUrl = next.href;
  }

  throw new PermanentError(`Too many redirects (> ${MAX_REDIRECTS}) starting from ${url}`);
}

/** Fetch with GitHub auth, mapping 404 -> PermanentError and other non-OK -> Error. */
async function fetchOk(url: string, token?: string): Promise<Response> {
  const resp = await secureFetch(url, githubHeaders(token));
  if (resp.status === 404) {
    throw new PermanentError(`Not found (404): ${url}`);
  }
  if (!resp.ok) {
    throw new Error(`GitHub responded ${resp.status} for ${url}`);
  }
  return resp;
}

/** Headers for a raw asset request (no JSON Accept); auth optional. */
function assetHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': 'setup-task-action' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Vet a download URL's full redirect chain against the host allowlist (NFR-1)
 * without downloading the body. Throws PermanentError on an untrusted host.
 */
export async function assertRedirectTrusted(url: string, token?: string): Promise<void> {
  const resp = await secureFetch(url, assetHeaders(token));
  await resp.body?.cancel();
}

/**
 * Reject a response whose body isn't the expected type — typically the HTML
 * rate-limit/error page ("Unicorn") that unauthenticated requests get (FR-3).
 * Throwing keeps it a transient failure so withRetry() retries, instead of the
 * body being parsed as valid (which would surface as a confusing downstream
 * failure, e.g. "checksum not found").
 */
function guardContentType(
  resp: Response,
  url: string,
  isExpected: (contentType: string) => boolean,
): void {
  const contentType = resp.headers.get('content-type') ?? '';
  if (!isExpected(contentType)) {
    throw new Error(
      `Unexpected content-type "${contentType}" from ${url} ` +
        `(likely a rate-limit/HTML error page — pass repo-token to authenticate).`,
    );
  }
}

/**
 * Read a response body as UTF-8 text, refusing bodies over `maxBytes` (NFR-1):
 * `resp.text()` buffers an unbounded stream, so a hijacked trusted host could
 * exhaust memory. Count bytes as they arrive and bail (PermanentError — retrying
 * just re-streams the same oversized body).
 */
export async function readCappedText(
  resp: Response,
  url: string,
  maxBytes: number = MAX_RESPONSE_BYTES,
): Promise<string> {
  if (!resp.body) {
    return '';
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined); // don't let a cancel error mask the limit
      throw new PermanentError(`Response from ${url} exceeded the ${maxBytes}-byte limit.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Fetch and parse JSON, requiring a JSON content-type (FR-3). */
export async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const resp = await fetchOk(url, token);
  guardContentType(resp, url, (contentType) => contentType.includes('json'));
  // Strip a leading BOM the way resp.json() did — JSON.parse rejects it.
  return JSON.parse((await readCappedText(resp, url)).replace(/^\uFEFF/, '')) as T;
}

/** Fetch a text body (the checksums file), rejecting HTML error pages (FR-3). */
export async function fetchText(url: string, token?: string): Promise<string> {
  const resp = await fetchOk(url, token);
  guardContentType(resp, url, (contentType) => !contentType.includes('html'));
  return readCappedText(resp, url);
}

/** GitHub-backed ReleaseApi implementation. */
export function createReleaseApi(token?: string): ReleaseApi {
  const base = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}`;
  return {
    async getLatestVersion(): Promise<string> {
      const release = await fetchJson<ReleasePayload>(`${base}/releases/latest`, token);
      return release.tag_name;
    },

    async listStableVersions(): Promise<string[]> {
      const versions: string[] = [];
      for (let page = 1; page <= 10; page++) {
        const releases = await fetchJson<ReleasePayload[]>(
          `${base}/releases?per_page=100&page=${page}`,
          token,
        );
        if (releases.length === 0) {
          break;
        }
        for (const release of releases) {
          if (release.draft || release.prerelease) {
            continue;
          }
          const cleaned = semver.clean(release.tag_name);
          if (cleaned) {
            versions.push(cleaned);
          }
        }
        if (releases.length < 100) {
          break;
        }
      }
      return versions;
    },
  };
}
