import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseChecksums, sha256File, verifyChecksum } from '../src/checksum';

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

  it('throws on a checksum mismatch', () => {
    expect(() => verifyChecksum(tmp, 'f'.repeat(64))).toThrow(/Checksum mismatch/);
  });
});
