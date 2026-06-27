import { fetch as undiciFetch } from 'undici';

/**
 * Re-export undici's fetch with a string-URL signature.
 *
 * This avoids type mismatches between undici's own Request/Response types and
 * the global DOM types exposed by Node, while still using the npm undici
 * implementation so the dispatcher configured by `proxy.ts` is guaranteed to
 * be picked up across Node versions.
 */
export const fetch = undiciFetch as (input: string, init?: RequestInit) => Promise<Response>;
