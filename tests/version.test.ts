import { describe, expect, it } from 'vitest';
import { isExact, resolveVersion, type ReleaseApi } from '../src/version';

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
