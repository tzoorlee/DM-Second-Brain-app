import { x as extract } from 'tar';
import { CampaignError } from './campaigns';
import { TEMPLATE_RELEASE, TEMPLATE_REPO } from './vault';

const DOWNLOAD_TIMEOUT_MS = 30_000;

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
  try {
    const res = await fetch(templateArchiveUrl(), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch {
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
