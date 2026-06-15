import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchText } from '../src/github';
import { PermanentError } from '../src/errors';

function stubFetch(body: string, init: { status?: number; contentType?: string } = {}): void {
  const headers: Record<string, string> = init.contentType ? { 'content-type': init.contentType } : {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: init.status ?? 200, headers })),
  );
}

describe('fetchText (checksums fetch)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the body for a plain-text checksums response', async () => {
    stubFetch(`${'a'.repeat(64)}  task_linux_amd64.tar.gz`, { contentType: 'text/plain' });
    await expect(fetchText('https://example/checksums.txt')).resolves.toContain('task_linux_amd64');
  });

  it('rejects an HTML error page as a retryable Error (not a silent checksum miss)', async () => {
    // The "Unicorn"/rate-limit page: must throw so withRetry() can retry,
    // rather than being parsed as an empty checksums file.
    stubFetch('<html><body>rate limited</body></html>', { contentType: 'text/html; charset=utf-8' });
    const err = await fetchText('https://example/checksums.txt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError); // transient → retryable
    expect((err as Error).message).toMatch(/content-type/);
  });

  it('throws PermanentError on 404', async () => {
    stubFetch('Not Found', { status: 404, contentType: 'text/plain' });
    await expect(fetchText('https://example/checksums.txt')).rejects.toBeInstanceOf(PermanentError);
  });
});
