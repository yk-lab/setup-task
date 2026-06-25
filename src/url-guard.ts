import { PermanentError } from './errors';

/**
 * Hosts trusted for GitHub release/API traffic (NFR-1). The action only ever
 * talks to GitHub: the REST API, the release-download endpoint, and the asset
 * CDN it redirects to. Everything else — including any redirect target — is
 * refused so a hijacked redirect can't point the download at an attacker host.
 *
 * Asset/checksum downloads 302 from `github.com` to the release-asset CDN. Both
 * the current host (`release-assets.githubusercontent.com`) and the previous one
 * (`objects.githubusercontent.com`) are listed, so the known CDN rename stays
 * covered; a future unknown rename fails loudly and is a one-line addition.
 *
 * The allowlist is an *explicit* set, not a `.githubusercontent.com` suffix:
 * `raw.`/`gist.githubusercontent.com` serve arbitrary user content and must
 * never be a trusted download target, or a hijacked redirect could feed us an
 * attacker-hosted checksums file.
 */
const ALLOWED_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

/** Whether a hostname belongs to a trusted GitHub host (NFR-1). */
export function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname.toLowerCase());
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
        'Allowed: github.com, api.github.com, release-assets.githubusercontent.com, objects.githubusercontent.com.',
    );
  }
}
