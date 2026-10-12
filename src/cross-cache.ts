import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { errorMessage } from './errors';

// Cross-job cache sharing via actions/cache (#88). The runner tool cache only
// helps within a job (or on self-hosted runners); on hosted runners each job
// starts with an empty one. Opt-in via the `cache` input.
//
// The *release archive* is cached, not the extracted tool dir: anything that
// can write this repo's cache can plant an entry under a predictable key, so a
// restored archive is untrusted until it passes the same SHA256 check against
// task_checksums.txt as a fresh download (the caller does that).

/** Cache key: OS + arch + resolved version fully determine the content. */
export function crossJobCacheKey(
  version: string,
  arch: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return `setup-task-${platform}-${arch}-${version}`;
}

// actions/cache scopes entries by a hash of the cached paths, so save and
// restore must use the exact same path — tool-cache's random download path won't do.
function archiveCachePath(version: string, assetName: string): string {
  const root = process.env.RUNNER_TEMP;
  if (!root) {
    throw new Error('RUNNER_TEMP is not defined');
  }
  return path.join(root, 'setup-task-cache', version, assetName);
}

// @actions/cache swallows every restore/save failure except ValidationError,
// logs it at its own level, and returns undefined / -1. The catch blocks below
// only see ValidationError, archiveCachePath() and file-copy errors.

/**
 * Restore a previously saved release archive. Returns its path on a hit, or
 * undefined on a miss. The archive is unverified. Never throws.
 */
export async function restoreCrossJobCache(
  version: string,
  arch: string,
  assetName: string,
): Promise<string | undefined> {
  if (!cache.isFeatureAvailable()) {
    core.warning(
      'actions/cache service is not available on this runner; skipping cross-job cache restore.',
    );
    return undefined;
  }
  const key = crossJobCacheKey(version, arch);
  try {
    const archive = archiveCachePath(version, assetName);
    // No restoreKeys and the path embeds the version, so a hit is always this
    // version's entry — no prefix-match check needed.
    if (!(await cache.restoreCache([archive], key))) {
      core.debug(`Cross-job cache miss (key: ${key})`);
      return undefined;
    }
    core.debug(`Cross-job cache restored with key: ${key}`);
    return archive;
  } catch (err) {
    core.warning(
      `Cross-job cache restore failed (${errorMessage(err)}); falling back to download.`,
    );
    return undefined;
  }
}

/**
 * Save a checksum-verified release archive for other jobs. Best-effort: never
 * throws, and never fails the job.
 */
export async function saveCrossJobCache(
  version: string,
  arch: string,
  assetName: string,
  verifiedArchive: string,
): Promise<void> {
  if (!cache.isFeatureAvailable()) {
    core.warning(
      'actions/cache service is not available on this runner; skipping cross-job cache save.',
    );
    return;
  }
  const key = crossJobCacheKey(version, arch);
  try {
    const archive = archiveCachePath(version, assetName);
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    fs.copyFileSync(verifiedArchive, archive);
    // -1 covers a parallel job's reservation, a read-only token and transient
    // failures alike; the library has already logged which one at its level.
    if ((await cache.saveCache([archive], key)) === -1) {
      core.info(`Task ${version} was not saved to the cross-job cache (key: ${key}).`);
      return;
    }
    core.info(`Saved task ${version} to the cross-job cache (key: ${key}).`);
  } catch (err) {
    core.warning(`Failed to save cross-job cache: ${errorMessage(err)}`);
  }
}
