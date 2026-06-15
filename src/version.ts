import * as semver from 'semver';

/**
 * Abstraction over the release source so the resolution logic can be unit
 * tested without network access. The GitHub-backed implementation lives in
 * github.ts (createReleaseApi).
 */
export interface ReleaseApi {
  /** Latest stable release tag (e.g. "v3.51.1" or "3.51.1"). */
  getLatestVersion(): Promise<string>;
  /** All stable (non-draft, non-prerelease) versions, cleaned (no "v"). */
  listStableVersions(): Promise<string[]>;
}

/** True when the input is a concrete version rather than a range/keyword. */
export function isExact(input: string): boolean {
  return semver.valid(semver.clean(input) ?? input) !== null;
}

/**
 * Resolve a user-supplied version spec to a concrete version (FR-1).
 *
 * - "latest" / "" / "*"     -> newest stable release
 * - exact ("3.51.1"/"v3..") -> returned as-is (unless checkLatest)
 * - semver range ("3.x")    -> highest stable release satisfying the range
 */
export async function resolveVersion(
  api: ReleaseApi,
  input: string,
  checkLatest = false,
): Promise<string> {
  const spec = (input || 'latest').trim();

  if (spec === 'latest' || spec === '*') {
    return cleanOrThrow(await api.getLatestVersion());
  }

  if (!checkLatest && isExact(spec)) {
    return cleanOrThrow(spec);
  }

  const versions = await api.listStableVersions();
  const match = semver.maxSatisfying(versions, spec);
  if (!match) {
    const sample = versions.slice(0, 5).join(', ');
    throw new Error(
      `No go-task release satisfies "${spec}". Available (newest few): ${sample}.`,
    );
  }
  return match;
}

function cleanOrThrow(version: string): string {
  const cleaned = semver.clean(version);
  if (!cleaned) {
    throw new Error(`Could not parse version "${version}".`);
  }
  return cleaned;
}
