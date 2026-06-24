import { PermanentError } from './errors';

/**
 * Hosts trusted for GitHub release/API traffic (NFR-1). The action only ever
 * talks to GitHub: the REST API, the release-download endpoint, and the asset
 * CDN it redirects to. Everything else — including any redirect target — is
 * refused so a hijacked redirect can't point the download at an attacker host.
 *
 * Asset/checksum downloads currently 302 from `github.com` to
 * `release-assets.githubusercontent.com` (previously `objects.githubusercontent.com`).
 * Matching the `.githubusercontent.com` suffix keeps us resilient to GitHub
 * renaming that CDN subdomain, while still staying within GitHub-owned hosts.
 */
const ALLOWED_EXACT_HOSTS = new Set(['github.com', 'api.github.com']);
const ALLOWED_HOST_SUFFIX = '.githubusercontent.com';

/** Whether a hostname belongs to a trusted GitHub host (NFR-1). */
export function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_EXACT_HOSTS.has(host) || host.endsWith(ALLOWED_HOST_SUFFIX);
}

/**
 * Throw a PermanentError unless `url` is an HTTPS URL on a trusted GitHub host
 * (NFR-1). A wrong host is a security failure, not a transient one, so it must
 * never be retried.
 */
export function assertAllowedHost(url: string, context: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PermanentError(`Invalid ${context} URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new PermanentError(`Refusing non-HTTPS ${context} URL: ${url}`);
  }
  if (!isAllowedHost(parsed.hostname)) {
    throw new PermanentError(
      `Refusing ${context} from untrusted host "${parsed.hostname}". ` +
        'Allowed: github.com, api.github.com, *.githubusercontent.com.',
    );
  }
}
