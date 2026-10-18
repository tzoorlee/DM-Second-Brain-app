import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignError, createCampaign } from '../src/app/utils/campaigns';
import { buildContext } from '../src/app/utils/studio-ai';
import { inheritedFrom } from '../src/app/utils/studio-inherited';
import { loadStep } from '../src/app/utils/studio-state';
import { getStep, readStepContent, studioSteps } from '../src/app/utils/studio-steps';
import { getField } from '../src/app/utils/worldbible';
import { isolateEnv, makeCampaign, makeTemplateArchive, makeTempDir, writePage } from './helpers';

let dir: string;
let source: string;

const write = (root: string, rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

function hashTree(root: string): string {
  const h = crypto.createHash('sha1');
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      h.update(path.relative(root, p));
      if (e.isDirectory()) walk(p);
      else h.update(fs.readFileSync(p));
    }
  };
  walk(root);
  return h.digest('hex');
}

describe('a new campaign from the world of another', () => {
  isolateEnv();
  beforeEach(() => {
    dir = makeTempDir();
    process.env.CAMPAIGNS_DIR = dir;
    source = makeCampaign(dir, 'silverbrook', { index: '# Silverbrook Campaign — Index\n' });
    write(source, 'raw/world-bible.md', '# World Bible\n\n## Campaign\n- **Name**: Silverbrook\n- **Output language**: English\n\n## Tone and Atmosphere\n- Hopeful.\n');
    write(source, 'raw/house-rules.md', '# House Rules\n- Crits max.\n');
    write(source, 'raw/srd/01_Races/Elf.md', '# Elf');
    write(source, 'raw/srd/README.md', '# SRD');
    write(source, 'raw/setting/notes.md', '# Notes');
    write(source, 'raw/worldbuilding/factions.md', '# Factions\n- The Order.');
    write(source, 'raw/sessions/session-01.md', '# Session 1');
    write(source, 'raw/interludes/2027-01-01-fire.md', '# Fire');
    write(source, '.dm-second-brain/studio/step-1.json', '{}');
    writePage(source, 'characters/npcs/maren.md', { type: 'npc', pg_known: true }, '# Elder Maren\n\nLeader of Silverbrook, died in the great fire.');
    write(source, 'wiki/characters/npcs/_template-npc.md', '# template');
  });

  const fixture = () => makeTemplateArchive();

  it('copies the world, not the campaign, and leaves the source untouched', async () => {
    const before = hashTree(source);
    const { id } = await createCampaign('The Second Age', fixture, { from: 'silverbrook', copyHouseRules: true });
    const root = path.join(dir, id);
    const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');
    expect(read('raw/house-rules.md')).toContain('Crits max.');
    expect(read('raw/srd/01_Races/Elf.md')).toBe('# Elf');
    expect(read('raw/setting/notes.md')).toBe('# Notes');
    expect(read('raw/worldbuilding/factions.md')).toContain('The Order.');
    expect(read('raw/setting/from-silverbrook/characters/npcs/maren.md')).toContain('died in the great fire');
    expect(read('raw/setting/from-silverbrook/index.md')).toContain('Silverbrook Campaign');
    expect(fs.existsSync(path.join(root, 'raw/setting/from-silverbrook/characters/npcs/_template-npc.md'))).toBe(false);
    for (const absent of ['raw/sessions/session-01.md', 'raw/interludes/2027-01-01-fire.md', 'wiki/characters/npcs/maren.md', '.dm-second-brain/studio/step-1.json']) {
      expect(fs.existsSync(path.join(root, absent))).toBe(false);
    }
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true);
    const bible = read('raw/world-bible.md');
    expect(getField(bible, 'Campaign', 'Name')).toBe('The Second Age');
    expect(bible).toContain('- Hopeful.');
    expect(hashTree(source)).toBe(before);
  });

  it('leaves the house rules out when asked', async () => {
    const { id } = await createCampaign('Other Table', fixture, { from: 'silverbrook', copyHouseRules: false });
    // The template's own house-rules.md (if any) stays; the source's isn't copied
    const rules = path.join(dir, id, 'raw/house-rules.md');
    expect(fs.existsSync(rules) ? fs.readFileSync(rules, 'utf-8') : '').not.toContain('Crits max.');
  });

  it('starts the Studio with the inherited step and the copied steps approved', async () => {
    const { id } = await createCampaign('The Second Age', fixture, { from: 'silverbrook', copyHouseRules: false });
    process.env.CAMPAIGNS_DIR = dir;
    expect(inheritedFrom()).toEqual({ id: 'silverbrook', title: 'Silverbrook Campaign' });
    expect(studioSteps().map(s => s.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(getStep(0)).toMatchObject({ id: 'inherited', title: 'Inherited world', file: 'raw/worldbuilding/inherited-world.md' });
    expect(readStepContent(0)).toContain('## When');
    expect([1, 2, 3, 4, 5, 6, 7].map(n => loadStep(n).status)).toEqual(['todo', 'approved', 'approved', 'approved', 'todo', 'approved', 'todo']);
    expect(id).toBe('the-second-age');
  });

  it('gives the AI the inherited history as context', async () => {
    await createCampaign('The Second Age', fixture, { from: 'silverbrook', copyHouseRules: false });
    const context = buildContext(0, 'What happened to Maren?');
    expect(context).toContain('raw/setting/from-silverbrook/index.md');
    expect(context).toContain('died in the great fire');
  });

  it('a campaign made from the template has no inherited step', async () => {
    await createCampaign('Fresh', fixture);
    expect(inheritedFrom()).toBeNull();
    expect(studioSteps().map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(() => getStep(0)).toThrow();
  });

  it('refuses an unknown or unsupported source', async () => {
    await expect(createCampaign('X', fixture, { from: 'nowhere' })).rejects.toMatchObject({ status: 400 });
    makeCampaign(dir, 'future', { marker: { vaultFormat: 99 } });
    await expect(createCampaign('Y', fixture, { from: 'future' })).rejects.toBeInstanceOf(CampaignError);
  });
});
