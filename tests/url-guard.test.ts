import { describe, expect, it } from 'vitest';
import { PermanentError } from '../src/errors';
import { assertAllowedHost, isAllowedHost } from '../src/url-guard';

describe('isAllowedHost', () => {
  it('allows the exact GitHub hosts', () => {
    expect(isAllowedHost('github.com')).toBe(true);
    expect(isAllowedHost('api.github.com')).toBe(true);
  });

  it('allows the release-asset CDN hosts (current + previous)', () => {
    expect(isAllowedHost('release-assets.githubusercontent.com')).toBe(true);
    expect(isAllowedHost('objects.githubusercontent.com')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isAllowedHost('GitHub.com')).toBe(true);
    expect(isAllowedHost('Release-Assets.GitHubUserContent.com')).toBe(true);
  });

  it('rejects user-content githubusercontent hosts (raw/gist)', () => {
    // These serve arbitrary user content and must not be a trusted target.
    expect(isAllowedHost('raw.githubusercontent.com')).toBe(false);
    expect(isAllowedHost('gist.githubusercontent.com')).toBe(false);
    expect(isAllowedHost('camo.githubusercontent.com')).toBe(false);
  });

  it('rejects look-alike / spoofed hosts', () => {
    expect(isAllowedHost('evil.com')).toBe(false);
    expect(isAllowedHost('github.com.evil.com')).toBe(false);
    expect(isAllowedHost('notgithub.com')).toBe(false);
    expect(isAllowedHost('evilgithubusercontent.com')).toBe(false);
    expect(isAllowedHost('githubusercontent.com.evil.com')).toBe(false);
  });
});

describe('assertAllowedHost', () => {
  it('passes for a trusted https URL', () => {
    expect(() =>
      assertAllowedHost('https://github.com/go-task/task/releases/download/v3.51.1/x', 'request'),
    ).not.toThrow();
  });

  it('throws PermanentError for an untrusted host', () => {
    expect(() => assertAllowedHost('https://evil.example.com/x', 'request')).toThrow(PermanentError);
  });

  it('throws PermanentError for a non-HTTPS URL', () => {
    expect(() => assertAllowedHost('http://github.com/x', 'request')).toThrow(/non-HTTPS/);
  });

  it('throws PermanentError for a malformed URL', () => {
    expect(() => assertAllowedHost('not a url', 'request')).toThrow(PermanentError);
  });
});
