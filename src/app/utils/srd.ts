import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CampaignError } from './campaign-error';
import { downloadCapped, extractArchive } from './download';
import { resolveInCampaign, WORLD_BIBLE, writeFileAtomic } from './studio-steps';
import { setField } from './worldbible';

export type SrdEdition = '5.1' | '5.2.1';

// Markdown conversions of the SRD, CC-BY-4.0, pinned to a commit so the content
// never changes under the DM.
export const SRD_SOURCES: Record<SrdEdition, { repo: string; tag: string; commit: string; label: string; attribution: string }> = {
  '5.1': {
    repo: 'oldmanumby/dnd.srd.5.1',
    tag: 'v0.5.2',
    commit: '7c343e598583f92bc74f80b197e40bdb20b165f1',
    label: 'SRD 5.1',
    attribution:
      'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  },
  '5.2.1': {
    repo: 'oldmanumby/dnd.srd.5.2.1',
    tag: 'v26.05.12.14',
    commit: 'e1d005dfbb15e3db966037431abdba4ee4c2b692',
    label: 'SRD 5.2.1',
    attribution:
      'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  },
};

const MAX_SRD_BYTES = 50 * 1024 * 1024;

// The conversions keep each part of the SRD in a numbered folder ("01_Races", "07_Spells")
export function isAllowedSrdPath(relativePath: string, isDirectory: boolean): boolean {
  const rel = relativePath.replace(/\/$/, '');
  const parts = rel.split('/');
  if (!rel || rel.startsWith('/') || rel.includes('\\') || parts.some(p => p === '' || p === '.' || p === '..')) return false;
  if (rel === 'Legal.md') return !isDirectory;
  if (!/^\d\d_[^/]+$/.test(parts[0])) return false;
  return isDirectory || rel.endsWith('.md');
}

function countFiles(dir: string): number {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1),
    0,
  );
}

function setRulesEdition(value: string) {
  const file = resolveInCampaign(WORLD_BIBLE);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '# World Bible\n\n';
  writeFileAtomic(file, setField(current, 'Campaign', 'Rules edition', value));
}

// Downloads an edition into raw/srd/, replacing a previous download but keeping
// raw/srd/README.md. The new files are extracted aside and swapped in only when
// complete, so a failure leaves the previous SRD as it was.
export async function downloadSrd(
  edition: SrdEdition,
  download: (url: string) => Promise<Buffer> = url => downloadCapped(url, MAX_SRD_BYTES, 'SRD'),
): Promise<{ files: number }> {
  const source = SRD_SOURCES[edition];
  const archive = await download(`https://codeload.github.com/${source.repo}/tar.gz/${source.commit}`);

  const id = crypto.randomBytes(4).toString('hex');
  const srdDir = path.dirname(resolveInCampaign('raw/srd/README.md'));
  const incoming = resolveInCampaign(`raw/srd/.downloading-${id}`);
  const outgoing = resolveInCampaign(`raw/srd/.replaced-${id}`);
  fs.mkdirSync(incoming, { recursive: true });
  try {
    try {
      await extractArchive(archive, incoming, isAllowedSrdPath);
    } catch {
      throw new CampaignError('The downloaded SRD is not a valid archive.', 502);
    }
    const files = countFiles(incoming);
    if (files === 0) throw new CampaignError('The downloaded SRD has no files.', 502);
    fs.writeFileSync(
      path.join(incoming, 'ATTRIBUTION.md'),
      `# Attribution\n\n${source.attribution}\n\nMarkdown conversion: https://github.com/${source.repo} (tag ${source.tag}, commit ${source.commit}).\n`,
    );

    // Swap: everything but README.md and the temporary folders moves out, the new files move in
    fs.mkdirSync(outgoing);
    for (const name of fs.readdirSync(srdDir)) {
      if (name === 'README.md' || name.startsWith('.downloading-') || name.startsWith('.replaced-')) continue;
      fs.renameSync(path.join(srdDir, name), path.join(outgoing, name));
    }
    for (const name of fs.readdirSync(incoming)) fs.renameSync(path.join(incoming, name), path.join(srdDir, name));
    setRulesEdition(source.label);
    return { files };
  } finally {
    fs.rmSync(incoming, { recursive: true, force: true });
    fs.rmSync(outgoing, { recursive: true, force: true });
  }
}

export function setNoSrd(): void {
  setRulesEdition('none');
}
