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

/**
 * Fetch JSON, guarding against the rate-limit HTML error pages that cause the
 * "Unicorn" failures in unauthenticated setups (FR-3). A non-JSON body is
 * treated as a transient failure so withRetry() can retry it.
 */
export async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const resp = await fetch(url, { headers: githubHeaders(token) });
  if (resp.status === 404) {
    throw new PermanentError(`Not found (404): ${url}`);
  }
  if (!resp.ok) {
    throw new Error(`GitHub API responded ${resp.status} for ${url}`);
  }
  const contentType = resp.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(
      `Unexpected content-type "${contentType}" from ${url} ` +
        `(likely a rate-limit/HTML error page — pass repo-token to authenticate).`,
    );
  }
  return (await resp.json()) as T;
}

/** Fetch a text body (used for the checksums file). */
export async function fetchText(url: string, token?: string): Promise<string> {
  const resp = await fetch(url, { headers: githubHeaders(token) });
  if (resp.status === 404) {
    throw new PermanentError(`Not found (404): ${url}`);
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  // An HTML body here is a rate-limit/error page, not the checksums file.
  // Treat it as a transient failure so withRetry() can retry it, instead of
  // letting parseChecksums() silently miss and fail as "checksum not found".
  const contentType = resp.headers.get('content-type') ?? '';
  if (contentType.includes('html')) {
    throw new Error(
      `Unexpected content-type "${contentType}" from ${url} ` +
        `(likely a rate-limit/HTML error page — pass repo-token to authenticate).`,
    );
  }
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
