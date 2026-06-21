import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from '../src/download';
import { PermanentError } from '../src/errors';

// @actions/core.warning writes to the Actions log; silence it in tests.
vi.mock('@actions/core', () => ({ warning: vi.fn() }));

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
