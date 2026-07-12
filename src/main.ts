import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { fetchChecksum, verifyChecksum } from './checksum';
import { DEFAULT_RETRIES, DEFAULT_RETRY_BASE_MS, releaseDownloadUrl, TOOL_NAME } from './constants';
import { downloadAsset, withRetry } from './download';
import { errorMessage } from './errors';
import { createReleaseApi } from './github';
import { parseRetryInput } from './inputs';
import { extract } from './install';
import { resolveAsset } from './platform';
import { configureProxyFromEnv } from './proxy';
import { resolveFromCache, resolveVersion } from './version';

// State collected as the pipeline runs. `phase` names the current step so a
// failure can be reported in the job summary (NFR-5), not just the log.
interface RunSummary {
  version: string;
  asset: string;
  source: string;
  cache: string;
  checksum: string;
  path: string;
  phase: string;
}

async function run(): Promise<void> {
  // Summary state collected during the run and written at the end (NFR-5).
  // Declared first so a failure anywhere below — including proxy/input setup —
  // is captured by the failure summary in the catch.
  const summary: RunSummary = {
    version: '',
    asset: '',
    source: 'go-task/task GitHub Releases',
    cache: 'miss',
    checksum: 'n/a',
    path: '',
    phase: 'reading configuration',
  };

  try {
    // Route fetch through the runner's proxy before any network call (#54).
    configureProxyFromEnv();

    const versionSpec = core.getInput('version') || 'latest';
    const token = core.getInput('repo-token') || process.env.GITHUB_TOKEN || '';
    const archOverride = core.getInput('architecture');
    const checkLatest = core.getBooleanInput('check-latest');
    const skipChecksum = core.getBooleanInput('skip-checksum');
    const retries = parseRetryInput(core.getInput('retries'), DEFAULT_RETRIES, 'retries');
    const retryBaseMs = parseRetryInput(
      core.getInput('retry-base-ms'),
      DEFAULT_RETRY_BASE_MS,
      'retry-base-ms',
    );

    // Mask the token so it can never leak into logs/summaries (NFR-1).
    if (token) {
      core.setSecret(token);
    }

    if (!token) {
      core.warning(
        'No GitHub token available; API requests are unauthenticated and may hit ' +
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression shown to the user
          'rate limits. Pass "repo-token: ${{ github.token }}" to avoid this.',
      );
    }

    summary.phase = 'resolving asset';
    const asset = resolveAsset(process.platform, process.arch, archOverride || undefined);
    summary.asset = asset.assetName;
    core.debug(`Target asset: ${asset.assetName}`);

    summary.phase = 'resolving version';
    // 1. Resolve the concrete version (FR-1). For a range with check-latest=false,
    //    prefer a satisfying cached version so we need no network round-trip and
    //    stay resilient to GitHub outages/rate limits (FR-7 / NFR-3 / G1).
    const api = createReleaseApi(token || undefined);
    let version = resolveFromCache(
      tc.findAllVersions(TOOL_NAME, asset.arch),
      versionSpec,
      checkLatest,
    );
    if (version) {
      core.info(
        `Using cached go-task ${version} satisfying "${versionSpec}" (skipped network resolution).`,
      );
    } else {
      version = await withRetry(() => resolveVersion(api, versionSpec, checkLatest), {
        retries,
        baseMs: retryBaseMs,
        name: 'resolve version',
      });
      core.info(`Resolved go-task version: ${version}`);
    }
    summary.version = version;

    summary.phase = 'checking tool cache';
    // 2. Tool-cache lookup (FR-7).
    let toolDir = tc.find(TOOL_NAME, version, asset.arch);
    const cacheHit = Boolean(toolDir);
    summary.cache = cacheHit ? 'hit' : 'miss';

    if (cacheHit) {
      core.info(`Restored task ${version} from tool cache.`);
    } else {
      const tag = `v${version}`;
      const url = releaseDownloadUrl(tag, asset.assetName);

      summary.phase = 'downloading release asset';
      // 3. Download (authenticated + retry, FR-3/FR-4).
      core.info(`Downloading ${url}`);
      const archivePath = await withRetry(() => downloadAsset(url, token || undefined), {
        retries,
        baseMs: retryBaseMs,
        name: 'download asset',
      });

      summary.phase = 'verifying checksum';
      // 4. Checksum verification (FR-5).
      if (skipChecksum) {
        summary.checksum = 'skipped';
        core.warning('Checksum verification skipped (skip-checksum=true).');
      } else {
        const expected = await withRetry(
          () => fetchChecksum(tag, asset.assetName, token || undefined),
          {
            retries,
            baseMs: retryBaseMs,
            name: 'fetch checksums',
          },
        );
        if (!expected) {
          throw new Error(
            `Checksum for ${asset.assetName} not found in the release checksums file. ` +
              'Set skip-checksum=true to bypass (not recommended).',
          );
        }
        verifyChecksum(archivePath, expected);
        summary.checksum = 'verified (SHA256)';
        core.info('Checksum verified (SHA256).');
      }

      summary.phase = 'extracting & caching';
      // 5. Extract + cache (FR-6/FR-7).
      const extractedDir = await extract(archivePath, asset.ext);
      toolDir = await tc.cacheDir(extractedDir, TOOL_NAME, version, asset.arch);
    }

    summary.phase = 'installing onto PATH';
    // 6. Ensure executable + expose on PATH (FR-6/FR-8).
    const binPath = path.join(toolDir, asset.binaryName);
    summary.path = binPath;
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

    // Emit a job summary after the fixed pipeline completes (NFR-5).
    // Best-effort: a summary write failure must not fail the action.
    try {
      await core.summary
        .addHeading('Install Task')
        .addTable([
          [
            { data: 'Item', header: true },
            { data: 'Value', header: true },
          ],
          ['Version', summary.version],
          ['Asset', summary.asset],
          ['Source', summary.source],
          ['Cache', summary.cache],
          ['Checksum', summary.checksum],
          ['Executable', summary.path],
        ])
        .write();
    } catch (err) {
      core.warning(`Failed to write job summary: ${errorMessage(err)}`);
    }
  } catch (err) {
    // The pipeline failed: record where and why in the job summary before the
    // outer handler marks the step failed. Best-effort; never masks the error.
    await writeFailureSummary(summary, err);
    throw err;
  }
}

// Best-effort failure summary: name the phase that broke and the state gathered
// so far, so a failed run is diagnosable from the job summary, not just the log.
async function writeFailureSummary(summary: RunSummary, err: unknown): Promise<void> {
  try {
    await core.summary
      .addHeading('Install Task — failed')
      .addTable([
        [
          { data: 'Item', header: true },
          { data: 'Value', header: true },
        ],
        ['Phase', summary.phase],
        ['Error', errorMessage(err)],
        ['Version', summary.version || '—'],
        ['Asset', summary.asset || '—'],
        ['Cache', summary.cache],
        ['Checksum', summary.checksum],
      ])
      .write();
  } catch (summaryErr) {
    core.warning(`Failed to write failure summary: ${errorMessage(summaryErr)}`);
  }
}

run().catch((err: unknown) => {
  core.setFailed(errorMessage(err));
});
