import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setGlobalDispatcher = vi.fn();
const envAgent = vi.fn();
vi.mock('undici', () => ({
  setGlobalDispatcher: (...args: unknown[]) => setGlobalDispatcher(...args),
  // Construct via the spy so a test can make the constructor throw.
  EnvHttpProxyAgent: class {
    constructor(...args: unknown[]) {
      envAgent(...args);
    }
  },
}));
vi.mock('@actions/core', () => ({ info: vi.fn(), warning: vi.fn() }));

import { configureProxyFromEnv } from '../src/proxy';

const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'NO_PROXY', 'no_proxy'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const v of PROXY_VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  vi.clearAllMocks();
});

afterEach(() => {
  for (const v of PROXY_VARS) {
    if (saved[v] === undefined) {
      delete process.env[v];
    } else {
      process.env[v] = saved[v];
    }
  }
});

describe('configureProxyFromEnv', () => {
  it('does nothing when no proxy env var is set', () => {
    configureProxyFromEnv();
    expect(setGlobalDispatcher).not.toHaveBeenCalled();
  });

  it('installs the dispatcher when HTTP_PROXY is set', () => {
    process.env.HTTP_PROXY = 'http://proxy:8080';
    configureProxyFromEnv();
    expect(setGlobalDispatcher).toHaveBeenCalledOnce();
  });

  it('honours the lowercase http_proxy variant', () => {
    process.env.http_proxy = 'http://proxy:8080';
    configureProxyFromEnv();
    expect(setGlobalDispatcher).toHaveBeenCalledOnce();
  });

  it('falls through an empty HTTP_PROXY to a real HTTPS_PROXY (|| not ??)', () => {
    process.env.HTTP_PROXY = '';
    process.env.HTTPS_PROXY = 'http://proxy:8080';
    configureProxyFromEnv();
    expect(setGlobalDispatcher).toHaveBeenCalledOnce();
  });

  it('throws an actionable error on a malformed proxy URL', () => {
    process.env.HTTP_PROXY = 'not-a-url';
    envAgent.mockImplementation(() => {
      throw new TypeError('Invalid URL');
    });
    expect(() => configureProxyFromEnv()).toThrow(/Invalid proxy URL.*not-a-url/);
    expect(setGlobalDispatcher).not.toHaveBeenCalled();
  });
});
