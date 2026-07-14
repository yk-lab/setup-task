import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermanentError } from '../src/errors';
import { fetch } from '../src/fetch';
import {
  assertRedirectTrusted,
  createReleaseApi,
  fetchJson,
  fetchText,
  readCappedText,
  secureFetch,
} from '../src/github';

vi.mock('../src/fetch', () => ({ fetch: vi.fn() }));

const mockedFetch = vi.mocked(fetch);

// Real allowlisted URLs: the host guard now rejects unknown hosts, so
// tests must hit github.com / api.github.com / *.githubusercontent.com.
const API_URL = 'https://api.github.com/repos/go-task/task/releases/latest';
const CHECKSUMS_URL =
  'https://github.com/go-task/task/releases/download/v3.51.1/task_checksums.txt';
const ASSET_CDN_URL = 'https://release-assets.githubusercontent.com/abc/task_checksums.txt';

/** Stub a single fixed response for every fetch() call. */
function stubFetch(body: string, init: { status?: number; contentType?: string } = {}): void {
  const headers: Record<string, string> = init.contentType
    ? { 'content-type': init.contentType }
    : {};
  mockedFetch.mockImplementation(
    async () => new Response(body, { status: init.status ?? 200, headers }),
  );
}

/** A 3xx redirect response pointing at `location`. */
function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

afterEach(() => {
  mockedFetch.mockReset();
});

describe('fetchJson (content-type guard)', () => {
  it('parses and returns the JSON body on a JSON response', async () => {
    stubFetch(JSON.stringify({ tag_name: 'v3.51.1' }), { contentType: 'application/json' });
    await expect(fetchJson(API_URL)).resolves.toEqual({ tag_name: 'v3.51.1' });
  });

  it('strips a leading BOM before parsing (as resp.json() did)', async () => {
    stubFetch(`\uFEFF${JSON.stringify({ tag_name: 'v3.51.1' })}`, {
      contentType: 'application/json',
    });
    await expect(fetchJson(API_URL)).resolves.toEqual({ tag_name: 'v3.51.1' });
  });

  it('rejects an HTML rate-limit page as a retryable Error pointing at repo-token', async () => {
    // 200 OK but non-JSON body = the "Unicorn" page. Must throw (transient),
    // not be parsed, so withRetry() can retry it.
    stubFetch('<html>rate limited</html>', { contentType: 'text/html; charset=utf-8' });
    const err = await fetchJson(API_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/content-type/);
    expect((err as Error).message).toMatch(/repo-token/);
  });

  it('throws PermanentError on 404 (no such resource — never retried)', async () => {
    stubFetch('Not Found', { status: 404, contentType: 'application/json' });
    await expect(fetchJson(API_URL)).rejects.toBeInstanceOf(PermanentError);
  });

  it('throws a (retryable) Error on other non-OK statuses', async () => {
    stubFetch('Server Error', { status: 503, contentType: 'application/json' });
    const err = await fetchJson(API_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/503/);
  });
});

describe('fetchText (checksums fetch)', () => {
  it('returns the body for a plain-text checksums response', async () => {
    stubFetch(`${'a'.repeat(64)}  task_linux_amd64.tar.gz`, { contentType: 'text/plain' });
    await expect(fetchText(CHECKSUMS_URL)).resolves.toContain('task_linux_amd64');
  });

  it('rejects an HTML error page as a retryable Error (not a silent checksum miss)', async () => {
    stubFetch('<html><body>rate limited</body></html>', {
      contentType: 'text/html; charset=utf-8',
    });
    const err = await fetchText(CHECKSUMS_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toMatch(/content-type/);
  });

  it('throws PermanentError on 404', async () => {
    stubFetch('Not Found', { status: 404, contentType: 'text/plain' });
    await expect(fetchText(CHECKSUMS_URL)).rejects.toBeInstanceOf(PermanentError);
  });

  it('rejects a redirect to an untrusted host with PermanentError', async () => {
    // The malicious-redirect injection this guards against: github.com 302s to an
    // attacker host; the checksums fetch must refuse it rather than follow.
    mockedFetch.mockImplementation(async () => redirectTo('https://evil.example.com/checksums'));
    await expect(fetchText(CHECKSUMS_URL)).rejects.toBeInstanceOf(PermanentError);
  });
});

describe('secureFetch (redirect host validation)', () => {
  it('follows a redirect to a trusted host and returns the final response', async () => {
    mockedFetch
      .mockResolvedValueOnce(redirectTo(ASSET_CDN_URL))
      .mockResolvedValueOnce(new Response('payload', { status: 200 }));

    const resp = await secureFetch(CHECKSUMS_URL, { 'User-Agent': 'x' });
    expect(resp.status).toBe(200);
    await expect(resp.text()).resolves.toBe('payload');
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect to an untrusted host with PermanentError', async () => {
    mockedFetch.mockImplementation(async () => redirectTo('https://evil.example.com/x'));
    await expect(secureFetch(CHECKSUMS_URL, {})).rejects.toBeInstanceOf(PermanentError);
  });

  it('rejects an initial untrusted URL without fetching', async () => {
    mockedFetch.mockImplementation(async () => new Response('should not run', { status: 200 }));
    await expect(secureFetch('https://evil.example.com/', {})).rejects.toBeInstanceOf(
      PermanentError,
    );
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('drops the Authorization header on a cross-origin redirect (token never leaks)', async () => {
    const seen: Array<Record<string, string>> = [];
    mockedFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      seen.push({ ...(init?.headers as Record<string, string>) });
      return _url.startsWith('https://github.com')
        ? redirectTo(ASSET_CDN_URL)
        : new Response('ok', { status: 200 });
    });

    await secureFetch(CHECKSUMS_URL, { 'User-Agent': 'x', Authorization: 'Bearer secret' });

    expect(seen[0].Authorization).toBe('Bearer secret'); // sent to github.com
    expect(seen[1].Authorization).toBeUndefined(); // stripped for the CDN host
  });

  it('throws PermanentError after too many redirects', async () => {
    // Always redirect (to a trusted host) so only the hop cap can stop it.
    mockedFetch.mockImplementation(async () => redirectTo(ASSET_CDN_URL));
    await expect(secureFetch(CHECKSUMS_URL, {})).rejects.toThrow(/Too many redirects/);
  });

  it('rejects a redirect status with no Location header (malformed) as PermanentError', async () => {
    mockedFetch.mockImplementation(async () => new Response(null, { status: 302 }));
    await expect(secureFetch(CHECKSUMS_URL, {})).rejects.toBeInstanceOf(PermanentError);
  });

  it('rejects a redirect with an unparsable Location as PermanentError', async () => {
    mockedFetch.mockImplementation(async () => redirectTo('http://'));
    await expect(secureFetch(CHECKSUMS_URL, {})).rejects.toBeInstanceOf(PermanentError);
  });

  it('assertRedirectTrusted rejects an untrusted binary redirect target', async () => {
    // The binary preflight (download.ts) relies on this: github.com 302s to an
    // attacker host -> PermanentError, before tool-cache ever downloads.
    const ASSET_URL =
      'https://github.com/go-task/task/releases/download/v3.51.1/task_linux_amd64.tar.gz';
    mockedFetch.mockImplementation(async () => redirectTo('https://evil.example.com/asset'));
    await expect(assertRedirectTrusted(ASSET_URL, 'tok')).rejects.toBeInstanceOf(PermanentError);
  });

  it('passes an abort signal (per-request timeout) to fetch', async () => {
    mockedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await secureFetch(CHECKSUMS_URL, {});
    expect(mockedFetch).toHaveBeenCalledWith(
      CHECKSUMS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe('readCappedText (response size cap)', () => {
  it('returns the body when under the cap', async () => {
    await expect(readCappedText(new Response('hello'), CHECKSUMS_URL, 100)).resolves.toBe('hello');
  });

  it('throws PermanentError when the streamed body exceeds the cap', async () => {
    // The streamed byte counter is the defence against an unbounded/hijacked body.
    await expect(
      readCappedText(new Response('abcdefghij'), CHECKSUMS_URL, 4),
    ).rejects.toBeInstanceOf(PermanentError);
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

    mockedFetch.mockImplementation(async (url: string) => {
      const page = url.includes('page=2') ? page2 : page1;
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const versions = await createReleaseApi().listStableVersions();

    expect(mockedFetch).toHaveBeenCalledTimes(2); // followed pagination, then stopped
    expect(versions).toContain('3.0.0'); // from the full first page (cleaned)
    expect(versions).toContain('3.200.0'); // the only stable entry on page 2
    expect(versions).not.toContain('3.201.0'); // draft excluded
    expect(versions).not.toContain('3.202.0'); // prerelease excluded
    expect(versions).toHaveLength(101); // 100 from page 1 + 1 stable from page 2
  });

  it('listStableVersions stops on an empty page', async () => {
    // A full first page then an empty page: loop must terminate on length === 0.
    let call = 0;
    mockedFetch.mockImplementation(async () => {
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

    const versions = await createReleaseApi().listStableVersions();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(versions).toHaveLength(100);
  });
});
