export type ArchiveExt = 'tar.gz' | 'zip';

export interface AssetInfo {
  /** go-task OS token (linux/darwin/windows/freebsd). */
  os: string;
  /** go-task arch token (386/amd64/arm/arm64/riscv64). */
  arch: string;
  /** Release asset file name, e.g. task_linux_amd64.tar.gz. */
  assetName: string;
  ext: ArchiveExt;
  /** Executable file name once extracted. */
  binaryName: string;
}

/** Node process.platform -> go-task OS token. */
const OS_MAP: Record<string, string> = {
  linux: 'linux',
  darwin: 'darwin',
  win32: 'windows',
  freebsd: 'freebsd',
};

/** Node process.arch -> go-task arch token. */
const ARCH_MAP: Record<string, string> = {
  x64: 'amd64',
  arm64: 'arm64',
  arm: 'arm',
  ia32: '386',
  riscv64: 'riscv64',
};

/**
 * Supported arch per OS, mirroring the assets published by go-task
 * (verified against the v3.51.1 releases).
 */
const SUPPORTED: Record<string, ReadonlySet<string>> = {
  linux: new Set(['386', 'amd64', 'arm', 'arm64', 'riscv64']),
  darwin: new Set(['amd64', 'arm64']),
  windows: new Set(['386', 'amd64', 'arm64']),
  freebsd: new Set(['386', 'amd64', 'arm', 'arm64']),
};

/**
 * Resolve the release asset for the current (or overridden) platform.
 * Throws on unsupported OS / arch combinations.
 */
export function resolveAsset(
  platform: string = process.platform,
  nodeArch: string = process.arch,
  archOverride?: string,
): AssetInfo {
  const os = OS_MAP[platform];
  if (!os) {
    throw new Error(`Unsupported OS "${platform}". Supported: ${Object.keys(OS_MAP).join(', ')}.`);
  }

  const override = archOverride?.trim();
  const arch = override || ARCH_MAP[nodeArch];
  if (!arch) {
    throw new Error(
      `Unsupported architecture "${nodeArch}". Pass the "architecture" input to override.`,
    );
  }

  if (!SUPPORTED[os].has(arch)) {
    throw new Error(
      `Unsupported os/arch "${os}/${arch}". Supported arch for ${os}: ` +
        `${[...SUPPORTED[os]].join(', ')}.`,
    );
  }

  const ext: ArchiveExt = os === 'windows' ? 'zip' : 'tar.gz';
  return {
    os,
    arch,
    assetName: `task_${os}_${arch}.${ext}`,
    ext,
    binaryName: os === 'windows' ? 'task.exe' : 'task',
  };
}
