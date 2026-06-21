import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { DEFAULT_RETRIES, TOOL_NAME, releaseDownloadUrl } from './constants';
import { downloadAsset, withRetry } from './download';
import { fetchChecksum, verifyChecksum } from './checksum';
import { errorMessage } from './errors';
import { createReleaseApi } from './github';
import { extract } from './install';
import { resolveAsset } from './platform';
import { resolveVersion } from './version';

async function run(): Promise<void> {
  const versionSpec = core.getInput('version') || 'latest';
  const token = core.getInput('repo-token') || process.env.GITHUB_TOKEN || '';
  const archOverride = core.getInput('architecture');
  const checkLatest = core.getBooleanInput('check-latest');
  const skipChecksum = core.getBooleanInput('skip-checksum');

  // Mask the token so it can never leak into logs/summaries (NFR-1).
  if (token) {
    core.setSecret(token);
  }

  if (!token) {
    core.warning(
      'No GitHub token available; API requests are unauthenticated and may hit ' +
        'rate limits. Pass "repo-token: ${{ github.token }}" to avoid this.',
    );
  }

  const asset = resolveAsset(process.platform, process.arch, archOverride || undefined);
  core.debug(`Target asset: ${asset.assetName}`);

  // 1. Resolve the concrete version (FR-1).
  const api = createReleaseApi(token || undefined);
  const version = await withRetry(() => resolveVersion(api, versionSpec, checkLatest), {
    retries: DEFAULT_RETRIES,
    name: 'resolve version',
  });
  core.info(`Resolved go-task version: ${version}`);

  // 2. Tool-cache lookup (FR-7).
  let toolDir = tc.find(TOOL_NAME, version, asset.arch);
  const cacheHit = Boolean(toolDir);

  if (cacheHit) {
    core.info(`Restored task ${version} from tool cache.`);
  } else {
    const tag = `v${version}`;
    const url = releaseDownloadUrl(tag, asset.assetName);

    // 3. Download (authenticated + retry, FR-3/FR-4).
    core.info(`Downloading ${url}`);
    const archivePath = await withRetry(() => downloadAsset(url, token || undefined), {
      retries: DEFAULT_RETRIES,
      name: 'download asset',
    });

    // 4. Checksum verification (FR-5).
    if (skipChecksum) {
      core.warning('Checksum verification skipped (skip-checksum=true).');
    } else {
      const expected = await withRetry(() => fetchChecksum(tag, asset.assetName, token || undefined), {
        retries: DEFAULT_RETRIES,
        name: 'fetch checksums',
      });
      if (!expected) {
        throw new Error(
          `Checksum for ${asset.assetName} not found in the release checksums file. ` +
            'Set skip-checksum=true to bypass (not recommended).',
        );
      }
      verifyChecksum(archivePath, expected);
      core.info('Checksum verified (SHA256).');
    }

    // 5. Extract + cache (FR-6/FR-7).
    const extractedDir = await extract(archivePath, asset.ext);
    toolDir = await tc.cacheDir(extractedDir, TOOL_NAME, version, asset.arch);
  }

  // 6. Ensure executable + expose on PATH (FR-6/FR-8).
  const binPath = path.join(toolDir, asset.binaryName);
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(binPath, 0o755);
    } catch {
      // best effort; archive is usually already executable
    }
  }
  core.addPath(toolDir);

  // 7. Outputs (FR-9).
  core.setOutput('version', version);
  core.setOutput('task-path', binPath);
  core.setOutput('cache-hit', String(cacheHit));
  core.info(`task ${version} is ready at ${binPath}`);
}

run().catch((err: unknown) => {
  core.setFailed(errorMessage(err));
});
