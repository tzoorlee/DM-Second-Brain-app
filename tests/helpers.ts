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
