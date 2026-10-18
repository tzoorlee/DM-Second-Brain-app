import { downloadCapped, extractArchive } from './download';
import { TEMPLATE_RELEASE, TEMPLATE_REPO } from './vault';

// The template archive is well under 1 MB; anything this big is not it
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

// What a new campaign takes from the template. The rest of the repository (README,
// CHANGELOG, examples/...) is about the template itself.
const TEMPLATE_FILES = ['CLAUDE.md', 'TEMPLATES.md', 'dm-second-brain.json', '.gitignore'];
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

export function downloadTemplateArchive(): Promise<Buffer> {
  return downloadCapped(templateArchiveUrl(), MAX_DOWNLOAD_BYTES, 'template');
}

// Extracts the allowed files and folders of a GitHub tarball into dest. Links and
// anything else that isn't a plain file or folder are skipped.
export function extractTemplate(archive: Buffer, dest: string): Promise<void> {
  return extractArchive(archive, dest, rel => isAllowedTemplatePath(rel));
}
