import * as path from 'node:path';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crossJobCacheKey, restoreCrossJobCache, saveCrossJobCache } from '../src/cross-cache';

// The actions/cache service is the boundary here; mock it so tests stay
// deterministic and network-free (CLAUDE.md test layering).
vi.mock('@actions/cache', () => ({
  isFeatureAvailable: vi.fn(() => true),
  restoreCache: vi.fn(),
  saveCache: vi.fn(async () => 0),
  ReserveCacheError: class ReserveCacheError extends Error {},
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
  it('keys on platform + arch + resolved version, with a version terminator', () => {
    expect(crossJobCacheKey('3.51.1', 'arm64', 'darwin')).toBe('setup-task-darwin-arm64-3.51.1-');
    expect(crossJobCacheKey('3.51.1', 'amd64', 'linux')).toBe('setup-task-linux-amd64-3.51.1-');
  });

  it('terminates the version so the service cannot prefix-match a longer version', () => {
    // Without the trailing "-", a request for 3.51.1 would prefix-match a
    // stored 3.51.10 entry. With it, the stored key no longer starts with ours.
    const requested = crossJobCacheKey('3.51.1', 'amd64', 'linux');
    const stored = crossJobCacheKey('3.51.10', 'amd64', 'linux');
    expect(stored.startsWith(requested)).toBe(false);
  });

  it('defaults to the current platform', () => {
    expect(crossJobCacheKey('3.51.1', 'arm64')).toBe(
      `setup-task-${process.platform}-arm64-3.51.1-`,
    );
  });
});

describe('restoreCrossJobCache', () => {
  const KEY = `setup-task-${process.platform}-arm64-3.51.1-`;

  it('restores the tool dir and its .complete marker with the versioned key', async () => {
    vi.mocked(cache.restoreCache).mockResolvedValueOnce(KEY);

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(true);
    expect(cache.restoreCache).toHaveBeenCalledWith(PATHS, KEY);
  });

  it('returns false on a cache miss', async () => {
    vi.mocked(cache.restoreCache).mockResolvedValueOnce(undefined);

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(false);
  });

  it('treats a prefix-matched different entry as a miss and names both keys', async () => {
    vi.mocked(cache.restoreCache).mockResolvedValueOnce(
      `setup-task-${process.platform}-arm64-3.51.10-`,
    );

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(false);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('prefix-matched'));
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('3.51.10'));
  });

  it('warns and returns false when the cache service is unavailable', async () => {
    vi.mocked(cache.isFeatureAvailable).mockReturnValueOnce(false);

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(false);
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });

  it('never throws: a restore failure warns and degrades to a download', async () => {
    vi.mocked(cache.restoreCache).mockRejectedValueOnce(new Error('blob store 503'));

    await expect(restoreCrossJobCache('3.51.1', 'arm64')).resolves.toBe(false);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('blob store 503'));
  });
});

describe('saveCrossJobCache', () => {
  const KEY = `setup-task-${process.platform}-arm64-3.51.1-`;

  it('saves the tool dir and its .complete marker with the versioned key', async () => {
    await saveCrossJobCache('3.51.1', 'arm64');

    expect(cache.saveCache).toHaveBeenCalledWith(PATHS, KEY);
  });

  it('warns when the cache service declines to save (returns -1)', async () => {
    vi.mocked(cache.saveCache).mockResolvedValueOnce(-1);

    await expect(saveCrossJobCache('3.51.1', 'arm64')).resolves.toBeUndefined();
    expect(core.info).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('was not saved'));
  });

  it('never throws: a conflicting parallel save only warns (ReserveCacheError)', async () => {
    vi.mocked(cache.saveCache).mockRejectedValueOnce(
      new cache.ReserveCacheError('Unable to reserve cache with key'),
    );

    await expect(saveCrossJobCache('3.51.1', 'arm64')).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to save'));
  });

  it('warns and skips when the cache service is unavailable', async () => {
    vi.mocked(cache.isFeatureAvailable).mockReturnValueOnce(false);

    await expect(saveCrossJobCache('3.51.1', 'arm64')).resolves.toBeUndefined();
    expect(cache.saveCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('not available'));
  });
});
