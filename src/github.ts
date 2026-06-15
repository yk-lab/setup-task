import * as semver from 'semver';
import { GITHUB_API, REPO_NAME, REPO_OWNER } from './constants';
import { PermanentError } from './errors';
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

/** Fetch with GitHub auth, mapping 404 -> PermanentError and other non-OK -> Error. */
async function fetchOk(url: string, token?: string): Promise<Response> {
  const resp = await fetch(url, { headers: githubHeaders(token) });
  if (resp.status === 404) {
    throw new PermanentError(`Not found (404): ${url}`);
  }
  if (!resp.ok) {
    throw new Error(`GitHub responded ${resp.status} for ${url}`);
  }
  return resp;
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
