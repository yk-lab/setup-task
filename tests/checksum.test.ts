import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { fetch } from '../src/fetch';
import { fetchChecksum, parseChecksums, sha256File, verifyChecksum } from '../src/checksum';
import { PermanentError } from '../src/errors';

vi.mock('../src/fetch', () => ({ fetch: vi.fn() }));

const mockedFetch = vi.mocked(fetch);

describe('parseChecksums', () => {
  const sample = [
    'd1c2f0...not64hex skip-this-malformed-line',
    `${'a'.repeat(64)}  task_linux_amd64.tar.gz`,
    `${'b'.repeat(64)}  task_darwin_arm64.tar.gz`,
    `${'c'.repeat(64)} *task_windows_amd64.zip`, // BSD-style "*name"
  ].join('\n');

  it('returns the checksum for a matching asset', () => {
    expect(parseChecksums(sample, 'task_linux_amd64.tar.gz')).toBe('a'.repeat(64));
    expect(parseChecksums(sample, 'task_darwin_arm64.tar.gz')).toBe('b'.repeat(64));
  });

  it('handles the BSD-style "*filename" form', () => {
    expect(parseChecksums(sample, 'task_windows_amd64.zip')).toBe('c'.repeat(64));
  });

  it('returns undefined when the asset is absent', () => {
    expect(parseChecksums(sample, 'task_linux_arm64.tar.gz')).toBeUndefined();
  });
});

describe('sha256File / verifyChecksum', () => {
  const tmp = path.join(os.tmpdir(), `setup-task-test-${process.pid}.bin`);
  const content = Buffer.from('hello task\n');
  fs.writeFileSync(tmp, content);
  const expected = crypto.createHash('sha256').update(content).digest('hex');

  afterAll(() => {
    fs.rmSync(tmp, { force: true });
  });

  it('computes the SHA256 of a file', () => {
    expect(sha256File(tmp)).toBe(expected);
  });

  it('passes verification for a matching checksum (case-insensitive)', () => {
    expect(() => verifyChecksum(tmp, expected.toUpperCase())).not.toThrow();
  });

  it('throws PermanentError on a checksum mismatch (never retried)', () => {
    expect(() => verifyChecksum(tmp, 'f'.repeat(64))).toThrow(/Checksum mismatch/);
    expect(() => verifyChecksum(tmp, 'f'.repeat(64))).toThrow(PermanentError);
  });
});

// Integration of the full checksum path: fetchChecksum (fetch + parse) feeding
// verifyChecksum (hash + compare). Proves a tampered archive is rejected
// (FR-5, 要求仕様書 §10.3). The action hard-codes its download source (CON-2),
// so the published checksums file is injected via a fetch stub.
describe('fetchChecksum + verifyChecksum: tamper detection', () => {
  afterEach(() => {
    mockedFetch.mockReset();
  });

  const ASSET = 'task_linux_amd64.tar.gz';
  const genuine = Buffer.from('genuine task archive payload');
  const genuineSha = crypto.createHash('sha256').update(genuine).digest('hex');
  const checksumsBody = [
    `${genuineSha}  ${ASSET}`,
    `${'0'.repeat(64)}  task_darwin_arm64.tar.gz`,
  ].join('\n');

  function stubChecksums(body: string): void {
    mockedFetch.mockImplementation(
      async () => new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
  }

  let counter = 0;
  function writeTmp(content: Buffer): string {
    const p = path.join(os.tmpdir(), `setup-task-tamper-${process.pid}-${counter++}.bin`);
    fs.writeFileSync(p, content);
    return p;
  }

  it('rejects a tampered archive against the published checksum', async () => {
    stubChecksums(checksumsBody);
    const expected = await fetchChecksum('v3.51.1', ASSET);
    expect(expected).toBe(genuineSha);
    if (!expected) return;

    const tampered = writeTmp(Buffer.concat([genuine, Buffer.from('!!injected')]));
    try {
      expect(() => verifyChecksum(tampered, expected)).toThrow(PermanentError);
      expect(() => verifyChecksum(tampered, expected)).toThrow(/Checksum mismatch/);
    } finally {
      fs.rmSync(tampered, { force: true });
    }
  });

  it('accepts a genuine archive matching the published checksum', async () => {
    stubChecksums(checksumsBody);
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
    stubChecksums(checksumsBody);
    await expect(fetchChecksum('v3.51.1', 'task_freebsd_riscv64.tar.gz')).resolves.toBeUndefined();
  });
});
