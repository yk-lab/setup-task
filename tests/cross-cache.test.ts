import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crossJobCacheKey, restoreCrossJobCache, saveCrossJobCache } from '../src/cross-cache';

// The actions/cache service is the boundary here; mock it so tests stay
// deterministic and network-free (CLAUDE.md test layering). Like the real
// library, the mocks report failures via undefined / -1 rather than throwing.
vi.mock('@actions/cache', () => ({
  isFeatureAvailable: vi.fn(() => true),
  restoreCache: vi.fn(),
  saveCache: vi.fn(async () => 0),
}));
// @actions/core writes to the Actions log; silence + observe it in tests.
vi.mock('@actions/core', () => ({ warning: vi.fn(), debug: vi.fn(), info: vi.fn() }));

const ASSET = 'task_linux_amd64.tar.gz';
const KEY = `setup-task-${process.platform}-amd64-3.51.1`;
let tmp: string;
let archive: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-cache-'));
  process.env.RUNNER_TEMP = tmp;
  archive = path.join(tmp, 'setup-task-cache', '3.51.1', ASSET);
});
afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RUNNER_TEMP;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('crossJobCacheKey', () => {
  it('keys on platform + arch + resolved version', () => {
    expect(crossJobCacheKey('3.51.1', 'arm64', 'darwin')).toBe('setup-task-darwin-arm64-3.51.1');
    expect(crossJobCacheKey('3.51.1', 'amd64', 'linux')).toBe('setup-task-linux-amd64-3.51.1');
  });

  it('defaults to the current platform', () => {
    expect(crossJobCacheKey('3.51.1', 'arm64')).toBe(`setup-task-${process.platform}-arm64-3.51.1`);
  });
});

describe('restoreCrossJobCache', () => {
  it('restores the archive to a fixed path and returns it on a hit', async () => {
    vi.mocked(cache.restoreCache).mockResolvedValueOnce(KEY);

    await expect(restoreCrossJobCache('3.51.1', 'amd64', ASSET)).resolves.toBe(archive);
    expect(cache.restoreCache).toHaveBeenCalledWith([archive], KEY);
  });

  it('returns undefined on a miss', async () => {
    vi.mocked(cache.restoreCache).mockResolvedValueOnce(undefined);

    await expect(restoreCrossJobCache('3.51.1', 'amd64', ASSET)).resolves.toBeUndefined();
  });

  it('warns and skips when the cache service is unavailable', async () => {
    vi.mocked(cache.isFeatureAvailable).mockReturnValueOnce(false);

    await expect(restoreCrossJobCache('3.51.1', 'amd64', ASSET)).resolves.toBeUndefined();
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });

  it('never throws: a missing RUNNER_TEMP warns and degrades to a download', async () => {
    delete process.env.RUNNER_TEMP;

    await expect(restoreCrossJobCache('3.51.1', 'amd64', ASSET)).resolves.toBeUndefined();
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('RUNNER_TEMP'));
  });
});

describe('saveCrossJobCache', () => {
  let verified: string;
  beforeEach(() => {
    verified = path.join(tmp, 'downloaded.tar.gz');
    fs.writeFileSync(verified, 'archive-bytes');
  });

  it('copies the verified archive to the restore path and saves it', async () => {
    await saveCrossJobCache('3.51.1', 'amd64', ASSET, verified);

    expect(cache.saveCache).toHaveBeenCalledWith([archive], KEY);
    expect(fs.readFileSync(archive, 'utf8')).toBe('archive-bytes');
  });

  it('logs at info level when the library declines to save (returns -1)', async () => {
    vi.mocked(cache.saveCache).mockResolvedValueOnce(-1);

    await expect(saveCrossJobCache('3.51.1', 'amd64', ASSET, verified)).resolves.toBeUndefined();
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('was not saved'));
    expect(core.warning).not.toHaveBeenCalled();
  });

  it('never throws: a ValidationError from the library warns', async () => {
    // The only error saveCache rethrows instead of returning -1.
    const err = Object.assign(new Error('Key Validation Error'), { name: 'ValidationError' });
    vi.mocked(cache.saveCache).mockRejectedValueOnce(err);

    await expect(saveCrossJobCache('3.51.1', 'amd64', ASSET, verified)).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Key Validation Error'));
  });

  it('never throws: a missing source archive warns without saving', async () => {
    await expect(
      saveCrossJobCache('3.51.1', 'amd64', ASSET, path.join(tmp, 'nope')),
    ).resolves.toBeUndefined();
    expect(cache.saveCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to save'));
  });

  it('warns and skips when the cache service is unavailable', async () => {
    vi.mocked(cache.isFeatureAvailable).mockReturnValueOnce(false);

    await expect(saveCrossJobCache('3.51.1', 'amd64', ASSET, verified)).resolves.toBeUndefined();
    expect(cache.saveCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });
});
