import { describe, expect, it } from 'vitest';
import { isExact, type ReleaseApi, resolveFromCache, resolveVersion } from '../src/version';

function fakeApi(latest: string, stable: string[]): ReleaseApi {
  return {
    getLatestVersion: async () => latest,
    listStableVersions: async () => stable,
  };
}

describe('isExact', () => {
  it('recognizes exact versions with/without v prefix', () => {
    expect(isExact('3.51.1')).toBe(true);
    expect(isExact('v3.51.1')).toBe(true);
  });

  it('rejects ranges and keywords', () => {
    expect(isExact('3.x')).toBe(false);
    expect(isExact('latest')).toBe(false);
    expect(isExact('^3.50')).toBe(false);
  });
});

describe('resolveVersion', () => {
  const api = fakeApi('v3.51.1', ['3.51.1', '3.50.0', '3.49.0', '3.40.0']);

  it('resolves "latest" via the API', async () => {
    expect(await resolveVersion(api, 'latest')).toBe('3.51.1');
  });

  it('defaults empty input to latest', async () => {
    expect(await resolveVersion(api, '')).toBe('3.51.1');
  });

  it('returns an exact version as-is (normalizing the v prefix)', async () => {
    expect(await resolveVersion(api, 'v3.49.0')).toBe('3.49.0');
  });

  it('resolves a semver range to the highest matching stable release', async () => {
    expect(await resolveVersion(api, '3.x')).toBe('3.51.1');
    expect(await resolveVersion(api, '>=3.40 <3.50')).toBe('3.49.0');
  });

  it('re-resolves an exact-looking spec when checkLatest is true', async () => {
    // With checkLatest, even "3.50.0" is treated as a range against the list.
    expect(await resolveVersion(api, '3.50.0', true)).toBe('3.50.0');
  });

  it('throws when no release satisfies the range', async () => {
    await expect(resolveVersion(api, '^9.0.0')).rejects.toThrow(/No go-task release satisfies/);
  });
});

describe('resolveFromCache', () => {
  const cached = ['3.49.0', '3.50.0', '3.40.0']; // unordered on purpose

  it('returns the highest cached version satisfying a range', () => {
    expect(resolveFromCache(cached, '3.x')).toBe('3.50.0');
    expect(resolveFromCache(cached, '>=3.40 <3.50')).toBe('3.49.0');
  });

  it('returns undefined when no cached version satisfies the range', () => {
    expect(resolveFromCache(cached, '^3.60')).toBeUndefined();
    expect(resolveFromCache([], '3.x')).toBeUndefined();
  });

  it('returns undefined when checkLatest is true (always re-resolve)', () => {
    expect(resolveFromCache(cached, '3.x', true)).toBeUndefined();
  });

  it('returns undefined for "latest" / "*" / empty (newest is network-defined)', () => {
    expect(resolveFromCache(cached, 'latest')).toBeUndefined();
    expect(resolveFromCache(cached, '*')).toBeUndefined();
    expect(resolveFromCache(cached, '')).toBeUndefined();
  });

  it('returns undefined for an exact spec (resolved without the network anyway)', () => {
    expect(resolveFromCache(cached, '3.50.0')).toBeUndefined();
    expect(resolveFromCache(cached, 'v3.50.0')).toBeUndefined();
  });
});
