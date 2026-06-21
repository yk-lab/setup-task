import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReleaseApi, fetchJson, fetchText } from '../src/github';
import { PermanentError } from '../src/errors';

/** Stub a single fixed response for every fetch() call. */
function stubFetch(
  body: string,
  init: { status?: number; contentType?: string } = {},
): void {
  const headers: Record<string, string> = init.contentType
    ? { 'content-type': init.contentType }
    : {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: init.status ?? 200, headers })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson (content-type guard, FR-3)', () => {
  it('parses and returns the JSON body on a JSON response', async () => {
    stubFetch(JSON.stringify({ tag_name: 'v3.51.1' }), { contentType: 'application/json' });
    await expect(fetchJson('https://api/releases/latest')).resolves.toEqual({
      tag_name: 'v3.51.1',
    });
  });

  it('rejects an HTML rate-limit page as a retryable Error pointing at repo-token', async () => {
    // 200 OK but non-JSON body = the "Unicorn" page. Must throw (transient),
    // not be parsed, so withRetry() can retry it.
    stubFetch('<html>rate limited</html>', { contentType: 'text/html; charset=utf-8' });
    const err = await fetchJson('https://api/releases/latest').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/content-type/);
    expect((err as Error).message).toMatch(/repo-token/);
  });

  it('throws PermanentError on 404 (no such resource — never retried)', async () => {
    stubFetch('Not Found', { status: 404, contentType: 'application/json' });
    await expect(fetchJson('https://api/releases/latest')).rejects.toBeInstanceOf(PermanentError);
  });

  it('throws a (retryable) Error on other non-OK statuses', async () => {
    stubFetch('Server Error', { status: 503, contentType: 'application/json' });
    const err = await fetchJson('https://api/releases/latest').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/503/);
  });
});

describe('fetchText (checksums fetch, FR-3)', () => {
  it('returns the body for a plain-text checksums response', async () => {
    stubFetch(`${'a'.repeat(64)}  task_linux_amd64.tar.gz`, { contentType: 'text/plain' });
    await expect(fetchText('https://example/checksums.txt')).resolves.toContain(
      'task_linux_amd64',
    );
  });

  it('rejects an HTML error page as a retryable Error (not a silent checksum miss)', async () => {
    stubFetch('<html><body>rate limited</body></html>', {
      contentType: 'text/html; charset=utf-8',
    });
    const err = await fetchText('https://example/checksums.txt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/content-type/);
  });

  it('throws PermanentError on 404', async () => {
    stubFetch('Not Found', { status: 404, contentType: 'text/plain' });
    await expect(fetchText('https://example/checksums.txt')).rejects.toBeInstanceOf(PermanentError);
  });
});

describe('createReleaseApi', () => {
  it('getLatestVersion returns the tag_name as-is', async () => {
    stubFetch(JSON.stringify({ tag_name: 'v3.51.1' }), { contentType: 'application/json' });
    await expect(createReleaseApi().getLatestVersion()).resolves.toBe('v3.51.1');
  });

  it('listStableVersions excludes drafts/prereleases and follows pagination', async () => {
    // page 1: a full page (100) of releases -> must fetch page 2.
    // page 2: a partial page (< 100) -> stop after it.
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      tag_name: `v3.${i}.0`,
      draft: false,
      prerelease: false,
    }));
    const page2 = [
      { tag_name: 'v3.200.0', draft: false, prerelease: false },
      { tag_name: 'v3.201.0', draft: true, prerelease: false }, // excluded
      { tag_name: 'v3.202.0-rc.1', draft: false, prerelease: true }, // excluded
      { tag_name: 'not-semver', draft: false, prerelease: false }, // dropped by semver.clean
    ];

    const fetchMock = vi.fn(async (url: string) => {
      const page = url.includes('page=2') ? page2 : page1;
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const versions = await createReleaseApi().listStableVersions();

    expect(fetchMock).toHaveBeenCalledTimes(2); // followed pagination, then stopped
    expect(versions).toContain('3.0.0'); // from the full first page (cleaned)
    expect(versions).toContain('3.200.0'); // the only stable entry on page 2
    expect(versions).not.toContain('3.201.0'); // draft excluded
    expect(versions).not.toContain('3.202.0'); // prerelease excluded
    expect(versions).toHaveLength(101); // 100 from page 1 + 1 stable from page 2
  });

  it('listStableVersions stops on an empty page', async () => {
    // A full first page then an empty page: loop must terminate on length === 0.
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      const body =
        call === 1
          ? Array.from({ length: 100 }, (_, i) => ({
              tag_name: `v3.${i}.0`,
              draft: false,
              prerelease: false,
            }))
          : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const versions = await createReleaseApi().listStableVersions();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(versions).toHaveLength(100);
  });
});
