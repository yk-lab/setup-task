import * as tc from '@actions/tool-cache';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadAsset, withRetry } from '../src/download';
import { PermanentError } from '../src/errors';
import { assertRedirectTrusted } from '../src/github';

// @actions/core writes to the Actions log; silence it in tests.
vi.mock('@actions/core', () => ({ warning: vi.fn(), debug: vi.fn() }));
// tool-cache performs the real download; stub it so we test orchestration only.
vi.mock('@actions/tool-cache', () => ({ downloadTool: vi.fn(async () => '/tmp/task-archive') }));
// Mock the HTTP module so download.test.ts stays free of network behaviour
// (the host/redirect logic itself is covered in github.test.ts; CLAUDE.md keeps
// network/IO out of these unit tests). We only assert downloadAsset's wiring.
vi.mock('../src/github', () => ({ assertRedirectTrusted: vi.fn() }));

// baseMs: 0 keeps backoff effectively instant (setTimeout(..., 0)).
const fast = { baseMs: 0 };

describe('withRetry', () => {
  afterEach(() => vi.clearAllMocks());

  it('resolves once the operation succeeds within the retry budget', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('transient');
      }
      return 'ok';
    });

    await expect(withRetry(fn, { ...fast, retries: 3 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3); // 2 failures + 1 success
  });

  it('throws the last error after exhausting all retries', async () => {
    const fn = vi.fn(async () => {
      throw new Error(`boom-${fn.mock.calls.length}`);
    });

    // retries: 2 -> 1 initial try + 2 retries = 3 attempts total.
    await expect(withRetry(fn, { ...fast, retries: 2 })).rejects.toThrow('boom-3');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a PermanentError (fails immediately)', async () => {
    const fn = vi.fn(async () => {
      throw new PermanentError('nope');
    });

    await expect(withRetry(fn, { ...fast, retries: 3 })).rejects.toThrow(PermanentError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry a tool-cache 404 (httpStatusCode === 404)', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('Not Found'), { httpStatusCode: 404 });
    });

    await expect(withRetry(fn, { ...fast, retries: 3 })).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('still retries a non-404 httpStatusCode (e.g. 503)', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw Object.assign(new Error('Service Unavailable'), { httpStatusCode: 503 });
      }
      return 'recovered';
    });

    await expect(withRetry(fn, { ...fast, retries: 3 })).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('downloadAsset (redirect preflight wiring, NFR-1)', () => {
  const ASSET_URL =
    'https://github.com/go-task/task/releases/download/v3.51.1/task_linux_amd64.tar.gz';

  afterEach(() => vi.clearAllMocks());

  it('preflights, then downloads via tool-cache', async () => {
    vi.mocked(assertRedirectTrusted).mockResolvedValueOnce();
    await expect(downloadAsset(ASSET_URL, 'tok')).resolves.toBe('/tmp/task-archive');
    expect(assertRedirectTrusted).toHaveBeenCalledWith(ASSET_URL, 'tok');
    expect(tc.downloadTool).toHaveBeenCalledOnce();
  });

  it('refuses an untrusted host (PermanentError) before tool-cache runs', async () => {
    vi.mocked(assertRedirectTrusted).mockRejectedValueOnce(new PermanentError('untrusted host'));
    await expect(downloadAsset(ASSET_URL, 'tok')).rejects.toBeInstanceOf(PermanentError);
    expect(tc.downloadTool).not.toHaveBeenCalled();
  });

  it('falls through to tool-cache when the preflight fails for a non-host reason (proxy)', async () => {
    // A network/proxy error in the preflight must not block the proxy-capable
    // tool-cache download (the binary is still checksum-verified downstream).
    vi.mocked(assertRedirectTrusted).mockRejectedValueOnce(new Error('proxy unreachable'));
    await expect(downloadAsset(ASSET_URL, 'tok')).resolves.toBe('/tmp/task-archive');
    expect(tc.downloadTool).toHaveBeenCalledOnce();
  });
});
