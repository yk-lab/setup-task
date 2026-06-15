import { describe, expect, it } from 'vitest';
import { resolveAsset } from '../src/platform';

describe('resolveAsset', () => {
  it('maps linux/x64 to task_linux_amd64.tar.gz', () => {
    const asset = resolveAsset('linux', 'x64');
    expect(asset).toMatchObject({
      os: 'linux',
      arch: 'amd64',
      assetName: 'task_linux_amd64.tar.gz',
      ext: 'tar.gz',
      binaryName: 'task',
    });
  });

  it('maps darwin/arm64 to task_darwin_arm64.tar.gz', () => {
    expect(resolveAsset('darwin', 'arm64').assetName).toBe('task_darwin_arm64.tar.gz');
  });

  it('maps win32/x64 to a zip with task.exe', () => {
    const asset = resolveAsset('win32', 'x64');
    expect(asset.assetName).toBe('task_windows_amd64.zip');
    expect(asset.ext).toBe('zip');
    expect(asset.binaryName).toBe('task.exe');
  });

  it('honors an architecture override', () => {
    expect(resolveAsset('linux', 'x64', 'arm64').assetName).toBe('task_linux_arm64.tar.gz');
  });

  it('auto-detects linux/riscv64 without an override', () => {
    // process.arch on a riscv64 runner is 'riscv64'; it must map to the asset.
    expect(resolveAsset('linux', 'riscv64').assetName).toBe('task_linux_riscv64.tar.gz');
  });

  it('throws on an unsupported OS', () => {
    expect(() => resolveAsset('aix', 'x64')).toThrow(/Unsupported OS/);
  });

  it('throws on an unsupported os/arch combination', () => {
    // darwin only ships amd64/arm64 — riscv64 is invalid.
    expect(() => resolveAsset('darwin', 'x64', 'riscv64')).toThrow(/Unsupported os\/arch/);
  });
});
