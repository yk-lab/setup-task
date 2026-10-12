import * as tc from '@actions/tool-cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyChecksum } from '../src/checksum';
import { restoreCrossJobCache, saveCrossJobCache } from '../src/cross-cache';
import { downloadAsset } from '../src/download';
import { extract } from '../src/install';
import { run } from '../src/main';

// run()'s cross-job cache wiring (#88): every module boundary is mocked so the
// test exercises only the orchestration — when restore/save happen relative to
// the tool-cache lookup and the download path.

// Mutable per-test knobs, hoisted so the vi.mock factories can reference them.
const { inputs, boolInputs } = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  boolInputs: {} as Record<string, boolean>,
}));

vi.mock('@actions/core', () => {
  // Chainable stub mirroring core.summary (same shape as main.test.ts).
  const summary: Record<string, ReturnType<typeof vi.fn>> = {};
  summary.addHeading = vi.fn(() => summary);
  summary.addTable = vi.fn(() => summary);
  summary.write = vi.fn(async () => summary);
  return {
    summary,
    getInput: vi.fn((name: string) => inputs[name] ?? ''),
    getBooleanInput: vi.fn((name: string) => boolInputs[name] ?? false),
    setSecret: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    debug: vi.fn(),
    setOutput: vi.fn(),
    addPath: vi.fn(),
  };
});

// Tool cache: miss by default; individual tests override find() sequences.
vi.mock('@actions/tool-cache', () => ({
  find: vi.fn(() => ''),
  findAllVersions: vi.fn(() => []),
  cacheDir: vi.fn(async () => '/tc/task/3.51.1/amd64'),
}));
vi.mock('../src/proxy', () => ({ configureProxyFromEnv: vi.fn() }));
vi.mock('../src/platform', () => ({
  resolveAsset: vi.fn(() => ({
    os: 'linux',
    arch: 'amd64',
    assetName: 'task_linux_amd64.tar.gz',
    ext: 'tar.gz',
    binaryName: 'task',
  })),
}));
vi.mock('../src/github', () => ({ createReleaseApi: vi.fn(() => ({})) }));
vi.mock('../src/version', () => ({
  resolveFromCache: vi.fn(() => undefined),
  resolveVersion: vi.fn(async () => '3.51.1'),
}));
// withRetry passes straight through: retry/backoff behaviour is covered in
// download.test.ts; here it would only slow the wiring assertions down.
vi.mock('../src/download', () => ({
  downloadAsset: vi.fn(async () => '/tmp/task_linux_amd64.tar.gz'),
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock('../src/checksum', () => ({
  fetchChecksum: vi.fn(async () => 'deadbeef'),
  verifyChecksum: vi.fn(),
}));
vi.mock('../src/install', () => ({ extract: vi.fn(async () => '/tmp/extracted') }));
vi.mock('../src/cross-cache', () => ({
  restoreCrossJobCache: vi.fn(async () => undefined),
  saveCrossJobCache: vi.fn(async () => {}),
}));

const FOUND = '/tc/task/3.51.1/amd64';
const ASSET = 'task_linux_amd64.tar.gz';
const DOWNLOADED = '/tmp/task_linux_amd64.tar.gz';
const RESTORED = '/runner-temp/setup-task-cache/3.51.1/task_linux_amd64.tar.gz';

async function outputs(): Promise<Record<string, string>> {
  const core = await import('@actions/core');
  const out: Record<string, string> = {};
  for (const [k, v] of vi.mocked(core.setOutput).mock.calls) {
    out[k] = v;
  }
  return out;
}

beforeEach(() => {
  inputs.version = '3.51.1';
  inputs['repo-token'] = 'tok';
  boolInputs.cache = false;
  // clearAllMocks() keeps implementations, so re-pin the tool-cache default
  // (a test that sets mockReturnValue would otherwise leak into the next one).
  vi.mocked(tc.find).mockReturnValue('');
});
afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(inputs)) delete inputs[k];
  for (const k of Object.keys(boolInputs)) delete boolInputs[k];
});

describe('run() cross-job cache wiring', () => {
  it('tool-cache hit: skips restore, download and save', async () => {
    vi.mocked(tc.find).mockReturnValue(FOUND);

    await run();

    expect(restoreCrossJobCache).not.toHaveBeenCalled();
    expect(downloadAsset).not.toHaveBeenCalled();
    expect(saveCrossJobCache).not.toHaveBeenCalled();
    expect(await outputs()).toMatchObject({ version: '3.51.1', 'cache-hit': 'true' });
  });

  it('cache disabled (default): downloads and never touches the cross-job cache', async () => {
    await run();

    expect(restoreCrossJobCache).not.toHaveBeenCalled();
    expect(downloadAsset).toHaveBeenCalledOnce();
    expect(saveCrossJobCache).not.toHaveBeenCalled();
    expect(await outputs()).toMatchObject({ 'cache-hit': 'false' });
  });

  it('cache enabled + verified restore: installs the restored archive, no download or re-save', async () => {
    boolInputs.cache = true;
    vi.mocked(restoreCrossJobCache).mockResolvedValueOnce(RESTORED);

    await run();

    expect(restoreCrossJobCache).toHaveBeenCalledWith('3.51.1', 'amd64', ASSET);
    expect(verifyChecksum).toHaveBeenCalledWith(RESTORED, 'deadbeef');
    expect(extract).toHaveBeenCalledWith(RESTORED, 'tar.gz');
    expect(downloadAsset).not.toHaveBeenCalled();
    expect(saveCrossJobCache).not.toHaveBeenCalled();
    expect(await outputs()).toMatchObject({
      version: '3.51.1',
      'cache-hit': 'true',
      'task-path': `${FOUND}/task`,
    });
  });

  it('cache enabled + restored archive fails the checksum: warns, downloads and saves', async () => {
    boolInputs.cache = true;
    vi.mocked(restoreCrossJobCache).mockResolvedValueOnce(RESTORED);
    vi.mocked(verifyChecksum).mockImplementationOnce(() => {
      throw new Error('Checksum mismatch');
    });
    const core = await import('@actions/core');

    await run();

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('failed verification'));
    expect(verifyChecksum).toHaveBeenLastCalledWith(DOWNLOADED, 'deadbeef');
    expect(extract).toHaveBeenCalledOnce();
    expect(extract).toHaveBeenCalledWith(DOWNLOADED, 'tar.gz');
    expect(saveCrossJobCache).toHaveBeenCalledWith('3.51.1', 'amd64', ASSET, DOWNLOADED);
    expect(await outputs()).toMatchObject({ 'cache-hit': 'false' });
  });

  it('cache enabled + restore miss: downloads, then saves the verified archive', async () => {
    boolInputs.cache = true;

    await run();

    expect(downloadAsset).toHaveBeenCalledOnce();
    expect(saveCrossJobCache).toHaveBeenCalledWith('3.51.1', 'amd64', ASSET, DOWNLOADED);
    expect(await outputs()).toMatchObject({ 'cache-hit': 'false' });
  });

  it('cache enabled + skip-checksum: never restores or saves the cross-job cache', async () => {
    boolInputs.cache = true;
    boolInputs['skip-checksum'] = true;
    const core = await import('@actions/core');

    await run();

    expect(restoreCrossJobCache).not.toHaveBeenCalled();
    expect(downloadAsset).toHaveBeenCalledOnce();
    expect(saveCrossJobCache).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('skip-checksum=true'));
    expect(await outputs()).toMatchObject({ 'cache-hit': 'false' });
  });
});
