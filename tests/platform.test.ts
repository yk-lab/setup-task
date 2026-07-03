import { describe, expect, it } from 'vitest';
import { resolveAsset } from '../src/platform';

// 要求仕様書 §9 platform matrix — the source of truth, kept independent of
// src/platform.ts's `SUPPORTED` so this test actually pins §9 (a drift in either
// fails here). Keys are go-task tokens; values map back to Node's process values.
const NODE_PLATFORM: Record<string, string> = {
  linux: 'linux',
  darwin: 'darwin',
  windows: 'win32',
  freebsd: 'freebsd',
};
const NODE_ARCH: Record<string, string> = {
  '386': 'ia32',
  amd64: 'x64',
  arm: 'arm',
  arm64: 'arm64',
  riscv64: 'riscv64',
};
// Derived from NODE_ARCH so the two can't drift.
const ALL_ARCHES = Object.keys(NODE_ARCH);
const MATRIX: Record<string, string[]> = {
  linux: ['386', 'amd64', 'arm', 'arm64', 'riscv64'],
  darwin: ['amd64', 'arm64'],
  windows: ['386', 'amd64', 'arm64'],
  freebsd: ['386', 'amd64', 'arm', 'arm64'],
};

const supported = Object.entries(MATRIX).flatMap(([os, arches]) =>
  arches.map((arch) => ({ os, arch })),
);
const unsupported = Object.entries(MATRIX).flatMap(([os, arches]) =>
  ALL_ARCHES.filter((arch) => !arches.includes(arch)).map((arch) => ({ os, arch })),
);

describe('resolveAsset — §9 platform matrix', () => {
  it.each(supported)('maps $os/$arch to the published asset', ({ os, arch }) => {
    const ext = os === 'windows' ? 'zip' : 'tar.gz';
    expect(resolveAsset(NODE_PLATFORM[os], NODE_ARCH[arch])).toMatchObject({
      os,
      arch,
      assetName: `task_${os}_${arch}.${ext}`,
      ext,
      binaryName: os === 'windows' ? 'task.exe' : 'task',
    });
  });

  it.each(unsupported)('rejects unsupported $os/$arch', ({ os, arch }) => {
    // The arch override targets os/arch combos a node arch alone couldn't reach.
    expect(() => resolveAsset(NODE_PLATFORM[os], 'x64', arch)).toThrow(/Unsupported os\/arch/);
  });
});

describe('resolveAsset — overrides & errors', () => {
  it('lets the architecture override win over the detected node arch', () => {
    expect(resolveAsset('linux', 'x64', 'arm64').assetName).toBe('task_linux_arm64.tar.gz');
  });

  it('throws on an unsupported OS', () => {
    expect(() => resolveAsset('aix', 'x64')).toThrow(/Unsupported OS/);
  });

  it('throws on an unmapped node architecture', () => {
    expect(() => resolveAsset('linux', 'mips')).toThrow(/Unsupported architecture/);
  });
});
