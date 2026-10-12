import * as path from 'node:path';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as semver from 'semver';
import { TOOL_NAME } from './constants';
import { errorMessage } from './errors';

// Cross-job cache sharing via actions/cache (#88). The runner tool cache only
// helps within a job (or on self-hosted runners); on hosted runners each job
// starts with an empty one. Opt-in via the `cache` input.

/** Cache key: OS + arch + resolved version fully determine the content. */
export function crossJobCacheKey(
  version: string,
  arch: string,
  platform: NodeJS.Platform = process.platform,
): string {
  // Trailing "-": the cache service prefix-matches keys, so without a version
  // terminator a request for 3.51.1 could restore a cached 3.51.10 archive.
  return `setup-task-${platform}-${arch}-${version}-`;
}

// Mirrors @actions/tool-cache's layout: <RUNNER_TOOL_CACHE>/<tool>/<clean
// version>/<arch>, with the ".complete" marker as a *sibling* of the directory
// — so both paths must be cached/restored for tc.find() to hit afterwards.
function toolCachePaths(version: string, arch: string): { dir: string; marker: string } {
  const root = process.env.RUNNER_TOOL_CACHE;
  if (!root) {
    throw new Error('RUNNER_TOOL_CACHE is not defined');
  }
  const dir = path.join(root, TOOL_NAME, semver.clean(version) ?? version, arch);
  return { dir, marker: `${dir}.complete` };
}

/**
 * Restore a previously saved tool-cache entry for `version`. Returns true when
 * a cache entry was restored; the caller re-checks via tc.find(). Never throws:
 * any failure (service down, network, quota) degrades to a normal download.
 */
export async function restoreCrossJobCache(version: string, arch: string): Promise<boolean> {
  if (!cache.isFeatureAvailable()) {
    core.warning(
      'actions/cache service is not available on this runner; skipping cross-job cache restore.',
    );
    return false;
  }
  const key = crossJobCacheKey(version, arch);
  try {
    const { dir, marker } = toolCachePaths(version, arch);
    const matched = await cache.restoreCache([dir, marker], key);
    if (!matched) {
      core.debug(`Cross-job cache miss (key: ${key})`);
      return false;
    }
    if (matched !== key) {
      // Prefix match on a different version's entry (the service matches keys
      // by prefix). The extracted bytes land under *that* version's tool-cache
      // path, which is harmless — but for this version it's a miss.
      core.warning(
        `Cross-job cache prefix-matched a different entry (requested "${key}", got "${matched}"); falling back to download.`,
      );
      return false;
    }
    core.debug(`Cross-job cache restored with key: ${matched}`);
    return true;
  } catch (err) {
    core.warning(
      `Cross-job cache restore failed (${errorMessage(err)}); falling back to download.`,
    );
    return false;
  }
}

/**
 * Save a freshly installed tool-cache entry for other jobs. Best-effort: a
 * parallel matrix job may have saved the same key first (ReserveCacheError),
 * and quota/network failures are never worth failing the job over.
 */
export async function saveCrossJobCache(version: string, arch: string): Promise<void> {
  if (!cache.isFeatureAvailable()) {
    core.warning(
      'actions/cache service is not available on this runner; skipping cross-job cache save.',
    );
    return;
  }
  const key = crossJobCacheKey(version, arch);
  try {
    const { dir, marker } = toolCachePaths(version, arch);
    const cacheId = await cache.saveCache([dir, marker], key);
    if (cacheId === -1) {
      // saveCache returns -1 when the cache service declines to save (e.g.
      // read-only cache mode on a fork PR) without throwing. This is expected
      // for some runners, so log at info level, not warning.
      core.info(`Task ${version} was not saved to the cross-job cache (key: ${key}).`);
      return;
    }
    core.info(`Saved task ${version} to the cross-job cache (key: ${key}).`);
  } catch (err) {
    // ReserveCacheError (another job reserved the same key first) and
    // CacheWriteDeniedError (read-only cache token) are expected races/policies;
    // only genuine unexpected failures are warnings.
    if (err instanceof cache.CacheWriteDeniedError) {
      core.info(
        `Task ${version} was not saved to the cross-job cache because cache writes are denied for this workflow (key: ${key}).`,
      );
      return;
    }
    if (err instanceof cache.ReserveCacheError) {
      core.info(
        `Task ${version} was not saved to the cross-job cache because the key is already reserved (key: ${key}).`,
      );
      return;
    }
    core.warning(`Failed to save cross-job cache: ${errorMessage(err)}`);
  }
}
