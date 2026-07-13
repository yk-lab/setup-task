import { PermanentError } from './errors';

/**
 * Hosts trusted for GitHub release/API traffic; any other host — including
 * a redirect target — is refused. An explicit set, not a `.githubusercontent.com`
 * suffix, because `raw.`/`gist.` serve arbitrary user content. Both the current
 * and previous asset-CDN hosts are listed to cover the `objects.`→`release-assets.`
 * rename.
 */
const ALLOWED_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

/** Whether a hostname belongs to a trusted GitHub host. */
export function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname.toLowerCase());
}

/** Throw a PermanentError unless `url` is an HTTPS URL on a trusted GitHub host. */
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
