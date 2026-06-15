import * as tc from '@actions/tool-cache';
import type { ArchiveExt } from './platform';

/** Extract a downloaded archive and return the extracted directory (FR-6). */
export async function extract(archivePath: string, ext: ArchiveExt): Promise<string> {
  return ext === 'zip' ? tc.extractZip(archivePath) : tc.extractTar(archivePath);
}
