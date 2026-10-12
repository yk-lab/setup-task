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
  return `setup-task-${platform}-${arch}-${version}`;
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

// @actions/cache swallows every restore/save failure except ValidationError,
// logs it at its own level, and returns undefined / -1. The catch blocks below
// only see ValidationError and toolCachePaths() errors.

/**
 * Restore a previously saved tool-cache entry for `version`. Returns true when
 * a cache entry was restored; the caller re-checks via tc.find(). Never throws.
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
    // No restoreKeys and the paths embed the version, so a hit is always this
    // version's entry — no prefix-match check needed.
    if (!(await cache.restoreCache([dir, marker], key))) {
      core.debug(`Cross-job cache miss (key: ${key})`);
      return false;
    }
    core.debug(`Cross-job cache restored with key: ${key}`);
    return true;
  } catch (err) {
    core.warning(
      `Cross-job cache restore failed (${errorMessage(err)}); falling back to download.`,
    );
    return false;
  }
}

/**
 * Save a freshly installed tool-cache entry for other jobs. Best-effort: never
 * throws, and never fails the job.
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
    // -1 covers a parallel job's reservation, a read-only token and transient
    // failures alike; the library has already logged which one at its level.
    if ((await cache.saveCache([dir, marker], key)) === -1) {
      core.info(`Task ${version} was not saved to the cross-job cache (key: ${key}).`);
      return;
    }
    core.info(`Saved task ${version} to the cross-job cache (key: ${key}).`);
  } catch (err) {
    core.warning(`Failed to save cross-job cache: ${errorMessage(err)}`);
  }
}
