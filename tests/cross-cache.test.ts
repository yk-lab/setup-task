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

const ROOT = '/toolcache';
// Expected restore/save paths: the tool dir plus its sibling ".complete"
// marker, mirroring @actions/tool-cache's on-disk layout. Use path.join so
// the assertions are correct on Windows too.
const DIR = path.join(ROOT, 'task', '3.51.1', 'arm64');
const PATHS = [DIR, `${DIR}.complete`];

beforeEach(() => {
  process.env.RUNNER_TOOL_CACHE = ROOT;
});
afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RUNNER_TOOL_CACHE;
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
  const KEY = `setup-task-${process.platform}-arm64-3.51.1`;

  it('restores the tool dir and its .complete marker with the versioned key', async () => {
    vi.mocked(cache.restoreCache).mockResolvedValueOnce(KEY);

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(true);
    expect(cache.restoreCache).toHaveBeenCalledWith(PATHS, KEY);
  });

  it('returns false on a cache miss', async () => {
    vi.mocked(cache.restoreCache).mockResolvedValueOnce(undefined);

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(false);
  });

  it('warns and returns false when the cache service is unavailable', async () => {
    vi.mocked(cache.isFeatureAvailable).mockReturnValueOnce(false);

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(false);
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });

  it('never throws: a missing RUNNER_TOOL_CACHE warns and degrades to a download', async () => {
    delete process.env.RUNNER_TOOL_CACHE;

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(false);
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('RUNNER_TOOL_CACHE'));
  });
});

describe('saveCrossJobCache', () => {
  const KEY = `setup-task-${process.platform}-arm64-3.51.1`;

  it('saves the tool dir and its .complete marker with the versioned key', async () => {
    await saveCrossJobCache('3.51.1', 'arm64');

    expect(cache.saveCache).toHaveBeenCalledWith(PATHS, KEY);
  });

  it('logs at info level when the cache service declines to save (returns -1)', async () => {
    vi.mocked(cache.saveCache).mockResolvedValueOnce(-1);

    await expect(saveCrossJobCache('3.51.1', 'arm64')).resolves.toBeUndefined();
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('was not saved'));
    expect(core.warning).not.toHaveBeenCalled();
  });

  it('never throws: a ValidationError from the library warns', async () => {
    // The only error saveCache rethrows instead of returning -1.
    const err = Object.assign(new Error('Key Validation Error'), { name: 'ValidationError' });
    vi.mocked(cache.saveCache).mockRejectedValueOnce(err);

    await expect(saveCrossJobCache('3.51.1', 'arm64')).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Key Validation Error'));
  });

  it('warns and skips when the cache service is unavailable', async () => {
    vi.mocked(cache.isFeatureAvailable).mockReturnValueOnce(false);

    await expect(saveCrossJobCache('3.51.1', 'arm64')).resolves.toBeUndefined();
    expect(cache.saveCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });
});
