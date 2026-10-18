import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  campaignHasSessions,
  readStepContent,
  resolveInCampaign,
  STUDIO_STEPS,
  writeStepContent,
} from '../src/app/utils/studio-steps';
import { getField, getSections } from '../src/app/utils/worldbible';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

const BIBLE = `# World Bible

## Campaign
- **Name**: (the campaign's name)
- **Output language**: (the language)

## Setting
- **World**: (Homebrew)

## Tone and Atmosphere
- (tone)

## Naming Conventions
- (names)
`;

const CLAUDE = `# CLAUDE.md

> - **Output language:** English _(change it)_
> - **Campaign name:** _(set in README and index.md)_

Rules follow.
`;

let root: string;
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');

describe('Studio steps', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    fs.mkdirSync(path.join(root, 'raw', 'worldbuilding'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'world-bible.md'), BIBLE);
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), CLAUDE);
    process.env.VAULT_PATH = root;
  });

  it('has the nine steps of the plan', () => {
    expect(STUDIO_STEPS.map(s => s.id)).toEqual(['basics', 'tone', 'world', 'names', 'rules', 'srd', 'worldbuilding', 'start', 'summary']);
  });

  it('reads a world-bible step as its own sections', () => {
    const draft = readStepContent(4);
    expect(draft).toBe('## Naming Conventions\n- (names)\n');
    expect(readStepContent(3)).toBe('## Basic Geography\n\n## Cosmology\n');
  });

  it('writes a world-bible step without touching other sections', () => {
    writeStepContent(2, '## Tone and Atmosphere\n- Grim.\n\n## Lore Pillars (immutable truths)\n- No resurrection.\n');
    const bible = read('raw/world-bible.md');
    expect(getSections(bible, ['Tone and Atmosphere'])['Tone and Atmosphere']).toBe('- Grim.\n\n');
    expect(bible).toContain('## Campaign\n- **Name**: (the campaign\'s name)\n');
    expect(bible.indexOf('## Lore Pillars')).toBeLessThan(bible.indexOf('## Naming Conventions'));
  });

  it('keeps both writes when two steps are approved one after the other', () => {
    writeStepContent(2, '## Tone and Atmosphere\n- Grim.\n');
    writeStepContent(4, '## Naming Conventions\n- Hard consonants.\n');
    const bible = read('raw/world-bible.md');
    expect(bible).toContain('- Grim.');
    expect(bible).toContain('- Hard consonants.');
  });

  it('step 1 also sets the CLAUDE.md configuration lines', () => {
    const written = writeStepContent(1, '## Campaign\n- **Name**: The Frozen North\n- **Output language**: Italiano\n\n## Setting\n- **World**: Homebrew\n');
    expect(written).toEqual(['raw/world-bible.md', 'CLAUDE.md']);
    expect(getField(read('raw/world-bible.md'), 'Campaign', 'Name')).toBe('The Frozen North');
    const claude = read('CLAUDE.md');
    expect(claude).toContain('> - **Output language:** Italiano\n');
    expect(claude).toContain('> - **Campaign name:** The Frozen North\n');
    expect(claude).toContain('Rules follow.');
  });

  it('step 1 leaves CLAUDE.md alone while the fields are placeholders', () => {
    expect(writeStepContent(1, readStepContent(1))).toEqual(['raw/world-bible.md']);
    expect(read('CLAUDE.md')).toBe(CLAUDE);
  });

  it('reads and writes whole-file steps', () => {
    expect(readStepContent(5)).toBe('');
    writeStepContent(5, '# House Rules\n\n## Combat\n- Crits max.\n');
    expect(read('raw/house-rules.md')).toBe('# House Rules\n\n## Combat\n- Crits max.\n');
    writeStepContent(8, '# Starting point\n- Ashford.\n');
    expect(read('raw/worldbuilding/starting-point.md')).toBe('# Starting point\n- Ashford.\n');
    expect(readStepContent(8)).toBe('# Starting point\n- Ashford.\n');
  });

  it('writes only the worldbuilding topics that have content', () => {
    const written = writeStepContent(7, '## Regions\n\n## Factions\n- The Order of the Broken Crown.\n');
    expect(written).toEqual(['raw/worldbuilding/factions.md']);
    expect(read('raw/worldbuilding/factions.md')).toBe('# Factions\n\n- The Order of the Broken Crown.\n');
    expect(fs.existsSync(path.join(root, 'raw/worldbuilding/regions.md'))).toBe(false);
    expect(readStepContent(7)).toContain('## Factions\n- The Order of the Broken Crown.\n');
  });

  it('refuses paths outside the Studio files', () => {
    for (const bad of ['../x.md', '/etc/passwd', 'wiki/a.md', 'raw/sessions/session-01.md', 'raw/srd/../../wiki/a.md']) {
      expect(() => resolveInCampaign(bad)).toThrow();
    }
    expect(resolveInCampaign('raw/srd/01_Races/Elf.md')).toBe(path.join(root, 'raw/srd/01_Races/Elf.md'));
  });

  it('knows whether the campaign has started', () => {
    expect(campaignHasSessions()).toBe(false);
    fs.mkdirSync(path.join(root, 'raw', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'sessions', 'README.md'), 'x');
    expect(campaignHasSessions()).toBe(false);
    fs.writeFileSync(path.join(root, 'raw', 'sessions', 'session-01.md'), 'x');
    expect(campaignHasSessions()).toBe(true);
  });
});
