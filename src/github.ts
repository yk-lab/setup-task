import * as semver from 'semver';
import { GITHUB_API, MAX_REDIRECTS, REPO_NAME, REPO_OWNER } from './constants';
import { PermanentError } from './errors';
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
 * against the GitHub allowlist (NFR-1) — a hijacked redirect to an attacker
 * host is refused instead of silently followed. The Authorization header is
 * stripped the moment a redirect crosses origins, so the repo-token never
 * leaks to the asset CDN github.com hands us off to (NFR-1).
 */
export async function secureFetch(url: string, headers: Record<string, string>): Promise<Response> {
  let currentUrl = url;
  let currentHeaders = headers;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedHost(currentUrl, 'request');
    const resp = await fetch(currentUrl, { headers: currentHeaders, redirect: 'manual' });

    if (!REDIRECT_STATUSES.has(resp.status)) {
      return resp;
    }

    // A redirect status with a missing or unparseable Location is malformed —
    // treat it as untrusted (PermanentError) rather than a trusted terminal,
    // so a bad redirect can't slip through the preflight's fall-through path.
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

    // Drop auth if the next hop crosses origins (don't leak the token off-host).
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
 * without downloading the body. tool-cache's downloader follows redirects
 * internally and can't be inspected, so the binary asset URL is pre-flighted
 * here before being handed to it. Throws PermanentError on an untrusted host.
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
function guardContentType(resp: Response, url: string, isExpected: (contentType: string) => boolean): void {
  const contentType = resp.headers.get('content-type') ?? '';
  if (!isExpected(contentType)) {
    throw new Error(
      `Unexpected content-type "${contentType}" from ${url} ` +
        `(likely a rate-limit/HTML error page — pass repo-token to authenticate).`,
    );
  }
}

/** Fetch and parse JSON, requiring a JSON content-type (FR-3). */
export async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const resp = await fetchOk(url, token);
  guardContentType(resp, url, (contentType) => contentType.includes('json'));
  return (await resp.json()) as T;
}

/** Fetch a text body (the checksums file), rejecting HTML error pages (FR-3). */
export async function fetchText(url: string, token?: string): Promise<string> {
  const resp = await fetchOk(url, token);
  guardContentType(resp, url, (contentType) => !contentType.includes('html'));
  return resp.text();
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
