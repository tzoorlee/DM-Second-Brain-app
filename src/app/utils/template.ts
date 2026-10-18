import { x as extract } from 'tar';
import { CampaignError } from './campaign-error';
import { TEMPLATE_RELEASE, TEMPLATE_REPO } from './vault';

const DOWNLOAD_TIMEOUT_MS = 30_000;
// The template archive is well under 1 MB; anything this big is not it
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

// What a new campaign takes from the template. The rest of the repository (README,
// CHANGELOG, examples/...) is about the template itself.
const TEMPLATE_FILES = ['CLAUDE.md', 'dm-second-brain.json', '.gitignore'];
const TEMPLATE_FOLDERS = ['wiki', 'raw', 'output'];

export function templateArchiveUrl(): string {
  return `https://codeload.github.com/${TEMPLATE_REPO}/tar.gz/refs/tags/${TEMPLATE_RELEASE}`;
}

// relativePath is an archive entry with the archive's top folder removed
export function isAllowedTemplatePath(relativePath: string): boolean {
  const parts = relativePath.replace(/\/$/, '').split('/');
  if (relativePath.startsWith('/') || relativePath.includes('\\')) return false;
  if (parts.some(part => part === '' || part === '.' || part === '..')) return false;
  return parts.length === 1
    ? TEMPLATE_FILES.includes(parts[0]) || TEMPLATE_FOLDERS.includes(parts[0])
    : TEMPLATE_FOLDERS.includes(parts[0]);
}

export async function downloadTemplateArchive(): Promise<Buffer> {
  const tooLarge = () => new CampaignError('The template download is too large.', 502);
  try {
    const res = await fetch(templateArchiveUrl(), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) throw tooLarge();

    // Read in chunks so an oversized body is cut off instead of buffered whole
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.length;
      if (size > MAX_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(read.value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof CampaignError) throw error;
    throw new CampaignError('Could not download the template. Are you offline?', 502);
  }
}

// Extracts the allowed files and folders of a GitHub tarball into dest. Links and
// anything else that isn't a plain file or folder are skipped.
export function extractTemplate(archive: Buffer, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const unpack = extract({
      cwd: dest,
      strip: 1,
      // strict turns a corrupt or non-tar download into an error instead of a warning
      strict: true,
      // tar calls the filter before stripping, so drop the top folder here
      filter: (entryPath, entry) =>
        ('type' in entry && (entry.type === 'File' || entry.type === 'Directory')) &&
        isAllowedTemplatePath(entryPath.split('/').slice(1).join('/')),
    });
    unpack.on('error', reject);
    unpack.on('close', () => resolve());
    unpack.end(archive);
  });
}
