import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach } from 'vitest';

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dmsb-test-'));
}

// A campaign folder with wiki/ and a vault marker. marker: null = no marker file,
// a string = written as-is, anything else = written as JSON.
export function makeCampaign(
  parent: string,
  id: string,
  { marker = { vaultFormat: 1 }, index }: { marker?: unknown; index?: string } = {},
): string {
  const root = path.join(parent, id);
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  if (marker !== null) {
    fs.writeFileSync(
      path.join(root, 'dm-second-brain.json'),
      typeof marker === 'string' ? marker : JSON.stringify(marker),
    );
  }
  if (index !== undefined) fs.writeFileSync(path.join(root, 'wiki', 'index.md'), index);
  return root;
}

export function writeActive(campaignsDir: string, content: string) {
  fs.writeFileSync(path.join(campaignsDir, '.active-campaign.json'), content);
}

// Each test starts with neither VAULT_PATH nor CAMPAIGNS_DIR set and gets the
// original environment back afterwards.
export function isolateEnv() {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.VAULT_PATH;
    delete process.env.CAMPAIGNS_DIR;
  });
  afterEach(() => {
    process.env = { ...saved };
  });
}

// A gzipped tarball shaped like GitHub's archive of the template: everything inside
// one top folder, plus files that must not reach a campaign (README, examples, a link).
export async function makeTemplateArchive({ marker = { vaultFormat: 1 } }: { marker?: unknown } = {}): Promise<Buffer> {
  const { c } = await import('tar');
  const cwd = makeTempDir();
  const top = path.join(cwd, 'DM-Second-Brain-0.4.0');
  const files: Record<string, string> = {
    'CLAUDE.md': '# Rules',
    'README.md': '# Readme',
    '.gitignore': 'TODO.md\n',
    'dm-second-brain.json': JSON.stringify(marker),
    'wiki/index.md': '# Campaign Index\n\nbody\n',
    'raw/world-bible.md': '# World',
    'raw/sessions/README.md': 'sessions',
    'output/.gitkeep': '',
    'examples/x/wiki/a.md': 'example',
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(top, rel)), { recursive: true });
    fs.writeFileSync(path.join(top, rel), content);
  }
  fs.symlinkSync('../README.md', path.join(top, 'wiki', 'link.md'));

  const chunks: Buffer[] = [];
  const stream = c({ gzip: true, cwd }, ['DM-Second-Brain-0.4.0']);
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Writes wiki/<rel> in a campaign folder with YAML frontmatter and a body
export function writePage(root: string, rel: string, frontmatter: Record<string, unknown>, body: string) {
  const file = path.join(root, 'wiki', rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const yaml = Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  fs.writeFileSync(file, `---\n${yaml}\n---\n\n${body}\n`);
}
