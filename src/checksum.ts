import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { CHECKSUMS_ASSET, releaseDownloadUrl } from './constants';
import { PermanentError } from './errors';
import { fetchText } from './github';

/**
 * Parse a `task_checksums.txt` body and return the SHA256 for the given asset.
 * Lines look like: "<64-hex>  task_linux_amd64.tar.gz" (optionally "*name").
 */
export function parseChecksums(text: string, assetName: string): string | undefined {
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2] === assetName) {
      return match[1].toLowerCase();
    }
  }
  return undefined;
}

/** Download and parse the checksums file for one asset (FR-5). */
export async function fetchChecksum(
  tag: string,
  assetName: string,
  token?: string,
): Promise<string | undefined> {
  const text = await fetchText(releaseDownloadUrl(tag, CHECKSUMS_ASSET), token);
  return parseChecksums(text, assetName);
}

/** Compute the SHA256 of a file as a lowercase hex string. */
export function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * Verify a file against an expected SHA256, throwing on mismatch (FR-5).
 * A mismatch is a permanent, security-relevant failure (never retried).
 */
export function verifyChecksum(filePath: string, expected: string): void {
  const actual = sha256File(filePath);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new PermanentError(`Checksum mismatch: expected ${expected}, got ${actual}.`);
  }
}
