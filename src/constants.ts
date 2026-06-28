/** Name used as the tool-cache key. */
export const TOOL_NAME = 'task';

/** Upstream repository that publishes the Task releases. */
export const REPO_OWNER = 'go-task';
export const REPO_NAME = 'task';

/** Single checksums file that covers every release asset. */
export const CHECKSUMS_ASSET = 'task_checksums.txt';

/** GitHub REST API base. */
export const GITHUB_API = 'https://api.github.com';

/** Default retry policy for transient network failures (FR-4). */
export const DEFAULT_RETRIES = 3;
export const DEFAULT_RETRY_BASE_MS = 1000;

/** Cap on redirects followed while validating each hop's host (NFR-1). */
export const MAX_REDIRECTS = 5;

/**
 * Per-request timeout and response-body size cap (NFR-1): bound how long a fetch
 * may hang and how much a (possibly hijacked) trusted host may stream. Both are
 * generous — the API pages and `task_checksums.txt` sit far below the cap.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Build the download URL for a release asset.
 * Tags on go-task are `v`-prefixed (e.g. v3.51.1).
 */
export function releaseDownloadUrl(tag: string, assetName: string): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag}/${assetName}`;
}
