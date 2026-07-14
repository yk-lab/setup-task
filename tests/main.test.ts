import * as core from '@actions/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFailureSummary } from '../src/main';

// The failure job summary (#78) is only reachable when run() throws, a
// path the happy-path self-test never exercises. writeFailureSummary is pure
// apart from the @actions/core summary builder, so mock that boundary and
// assert what lands in the summary table. Importing ../src/main has no side
// effect because the pipeline entry point lives in src/index.ts.
vi.mock('@actions/core', () => {
  // Chainable stub mirroring core.summary: addHeading()/addTable() return the
  // builder, write() resolves. Reached via `core.summary` in the assertions.
  const summary: Record<string, ReturnType<typeof vi.fn>> = {};
  summary.addHeading = vi.fn(() => summary);
  summary.addTable = vi.fn(() => summary);
  summary.write = vi.fn(async () => summary);
  return { summary, warning: vi.fn() };
});

// A RunSummary with every field populated; individual tests tweak fields inline.
const fullSummary = {
  version: '3.51.1',
  asset: 'task_linux_amd64.tar.gz',
  source: 'go-task/task GitHub Releases',
  cache: 'miss',
  checksum: 'n/a',
  path: '',
  phase: 'downloading release asset',
};

// The rows array handed to core.summary.addTable on the most recent call.
function lastTableRows(): unknown[] {
  const calls = vi.mocked(core.summary.addTable).mock.calls;
  return calls[calls.length - 1][0] as unknown[];
}

describe('writeFailureSummary', () => {
  afterEach(() => vi.clearAllMocks());

  it('records the failed phase, error, and partial state in the summary table', async () => {
    await writeFailureSummary({ ...fullSummary }, new Error('boom'));

    expect(core.summary.addHeading).toHaveBeenCalledWith('Install Task — failed');
    const rows = lastTableRows();
    expect(rows).toContainEqual(['Phase', 'downloading release asset']);
    expect(rows).toContainEqual(['Error', 'boom']);
    expect(rows).toContainEqual(['Version', '3.51.1']);
    expect(rows).toContainEqual(['Asset', 'task_linux_amd64.tar.gz']);
    expect(rows).toContainEqual(['Cache', 'miss']);
    expect(rows).toContainEqual(['Checksum', 'n/a']);
    expect(core.summary.write).toHaveBeenCalledOnce();
  });

  it('shows a "—" placeholder for state not yet collected when the run fails early', async () => {
    await writeFailureSummary(
      { ...fullSummary, version: '', asset: '', phase: 'reading configuration' },
      new Error('bad input'),
    );

    const rows = lastTableRows();
    expect(rows).toContainEqual(['Phase', 'reading configuration']);
    expect(rows).toContainEqual(['Version', '—']);
    expect(rows).toContainEqual(['Asset', '—']);
  });

  it('coerces a non-Error thrown value into a string for the Error cell', async () => {
    await writeFailureSummary({ ...fullSummary }, 'weird string failure');

    expect(lastTableRows()).toContainEqual(['Error', 'weird string failure']);
  });

  it('never throws when the summary write itself fails, warning instead (best-effort)', async () => {
    vi.mocked(core.summary.write).mockRejectedValueOnce(new Error('disk full'));

    await expect(
      writeFailureSummary({ ...fullSummary }, new Error('boom')),
    ).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write failure summary'),
    );
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });
});
