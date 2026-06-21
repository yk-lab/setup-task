import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchChecksum, verifyChecksum } from '../src/checksum';
import { PermanentError } from '../src/errors';

/**
 * Integration test for the checksum pipeline (FR-5, 要求仕様書 §10.3): exercise
 * fetchChecksum (network + parse) and verifyChecksum (hash + compare) together
 * and prove that a tampered archive is rejected. The action hard-codes its
 * download source (CON-2), so the malicious response is injected by stubbing
 * fetch rather than by pointing the action at another URL.
 */

const ASSET = 'task_linux_amd64.tar.gz';

function stubChecksumsBody(body: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } })),
  );
}

let tmpCounter = 0;
function writeTmp(content: Buffer): string {
  const p = path.join(os.tmpdir(), `setup-task-tamper-${process.pid}-${tmpCounter++}.bin`);
  fs.writeFileSync(p, content);
  return p;
}

describe('checksum tamper detection (fetch + parse + verify)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const genuine = Buffer.from('genuine task archive payload');
  const genuineSha = crypto.createHash('sha256').update(genuine).digest('hex');
  const checksumsBody = [
    `${genuineSha}  ${ASSET}`,
    `${'0'.repeat(64)}  task_darwin_arm64.tar.gz`,
  ].join('\n');

  it('rejects a tampered archive against the published checksum', async () => {
    stubChecksumsBody(checksumsBody);
    const expected = await fetchChecksum('v3.51.1', ASSET);
    expect(expected).toBe(genuineSha);
    if (!expected) return;

    const tampered = writeTmp(Buffer.concat([genuine, Buffer.from('!!injected')]));
    try {
      // A mismatch is a permanent, security-relevant failure (never retried).
      expect(() => verifyChecksum(tampered, expected)).toThrow(PermanentError);
      expect(() => verifyChecksum(tampered, expected)).toThrow(/Checksum mismatch/);
    } finally {
      fs.rmSync(tampered, { force: true });
    }
  });

  it('accepts a genuine archive matching the published checksum', async () => {
    stubChecksumsBody(checksumsBody);
    const expected = await fetchChecksum('v3.51.1', ASSET);
    expect(expected).toBe(genuineSha);
    if (!expected) return;

    const file = writeTmp(genuine);
    try {
      expect(() => verifyChecksum(file, expected)).not.toThrow();
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('returns undefined when the asset is absent from the checksums file', async () => {
    stubChecksumsBody(checksumsBody);
    await expect(fetchChecksum('v3.51.1', 'task_freebsd_riscv64.tar.gz')).resolves.toBeUndefined();
  });
});
