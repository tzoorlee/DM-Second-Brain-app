import { x as extract } from 'tar';
import { CampaignError } from './campaign-error';

const DOWNLOAD_TIMEOUT_MS = 30_000;

// Downloads a GitHub archive with a size cap, reading in chunks so an oversized body
// is cut off instead of buffered whole. Errors become CampaignError 502 with `what`
// in the message ("the template", "the SRD").
export async function downloadCapped(url: string, maxBytes: number, what: string): Promise<Buffer> {
  const tooLarge = () => new CampaignError(`The ${what} download is too large.`, 502);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get('content-length')) > maxBytes) throw tooLarge();

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(read.value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof CampaignError) throw error;
    throw new CampaignError(`Could not download the ${what}. Are you offline?`, 502);
  }
}

// Extracts a GitHub tarball into dest, dropping its top folder. `allow` gets the path
// without the top folder and whether the entry is a directory. Only plain files and
// folders are extracted (no links); a corrupt archive rejects.
export function extractArchive(archive: Buffer, dest: string, allow: (relativePath: string, isDirectory: boolean) => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const unpack = extract({
      cwd: dest,
      strip: 1,
      // strict turns a corrupt or non-tar download into an error instead of a warning
      strict: true,
      // tar calls the filter before stripping, so drop the top folder here
      filter: (entryPath, entry) =>
        'type' in entry &&
        (entry.type === 'File' || entry.type === 'Directory') &&
        allow(entryPath.split('/').slice(1).join('/'), entry.type === 'Directory'),
    });
    unpack.on('error', reject);
    unpack.on('close', () => resolve());
    unpack.end(archive);
  });
}
