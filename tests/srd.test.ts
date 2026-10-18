import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignError } from '../src/app/utils/campaign-error';
import { downloadSrd, isAllowedSrdPath, setNoSrd, SRD_SOURCES } from '../src/app/utils/srd';
import { getField } from '../src/app/utils/worldbible';
import { isolateEnv, makeArchive, makeCampaign, makeTempDir } from './helpers';

let root: string;
const srd = (...p: string[]) => path.join(root, 'raw', 'srd', ...p);
const bible = () => fs.readFileSync(path.join(root, 'raw', 'world-bible.md'), 'utf-8');

const fixture = () =>
  makeArchive(
    'dnd.srd.5.1-7c343e5',
    {
      'Legal.md': '# Legal',
      'README.md': '# Repo readme',
      '01_Races/Elf.md': '# Elf',
      '07_Spells/Fireball.md': '# Fireball',
      '07_Spells/image.png': 'png',
      'docs_original/srd.pdf': 'pdf',
      '.github/workflow.yml': 'x',
    },
    { '01_Races/link.md': '../Legal.md' },
  );

describe('SRD download', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    fs.mkdirSync(srd(), { recursive: true });
    fs.writeFileSync(srd('README.md'), '# SRD — put it here');
    fs.writeFileSync(path.join(root, 'raw', 'world-bible.md'), '# World Bible\n\n## Campaign\n- **Name**: Test\n- **Rules edition**: (SRD 5.1 | SRD 5.2.1 | none)\n');
    process.env.VAULT_PATH = root;
  });

  it('pins both editions to a commit', () => {
    expect(SRD_SOURCES['5.1'].commit).toBe('7c343e598583f92bc74f80b197e40bdb20b165f1');
    expect(SRD_SOURCES['5.2.1'].commit).toBe('e1d005dfbb15e3db966037431abdba4ee4c2b692');
  });

  it.each(['Legal.md', '01_Races/Elf.md', '11_Monsters/Dragons/Red.md'])('allows %s', p => expect(isAllowedSrdPath(p, false)).toBe(true));
  it.each(['README.md', 'docs_original/srd.pdf', '07_Spells/image.png', '../x.md', '01_Races/../../x.md', '1_Races/a.md', ''])('rejects %s', p =>
    expect(isAllowedSrdPath(p, false)).toBe(false),
  );

  it('downloads only the SRD files, keeps the README and writes the attribution', async () => {
    let url = '';
    const result = await downloadSrd('5.1', async u => {
      url = u;
      return fixture();
    });
    expect(url).toBe('https://codeload.github.com/oldmanumby/dnd.srd.5.1/tar.gz/7c343e598583f92bc74f80b197e40bdb20b165f1');
    expect(result.files).toBe(3);
    expect(fs.readFileSync(srd('01_Races', 'Elf.md'), 'utf-8')).toBe('# Elf');
    expect(fs.existsSync(srd('docs_original'))).toBe(false);
    expect(fs.existsSync(srd('07_Spells', 'image.png'))).toBe(false);
    expect(() => fs.lstatSync(srd('01_Races', 'link.md'))).toThrow();
    expect(fs.readFileSync(srd('README.md'), 'utf-8')).toBe('# SRD — put it here');
    expect(fs.readFileSync(srd('ATTRIBUTION.md'), 'utf-8')).toContain('Creative Commons Attribution 4.0');
    expect(fs.readFileSync(srd('ATTRIBUTION.md'), 'utf-8')).toContain('7c343e598583f92bc74f80b197e40bdb20b165f1');
    expect(getField(bible(), 'Campaign', 'Rules edition')).toBe('SRD 5.1');
    expect(fs.readdirSync(srd()).filter(n => n.startsWith('.'))).toEqual([]);
  });

  it('replaces a previous download', async () => {
    fs.mkdirSync(srd('99_Old'), { recursive: true });
    fs.writeFileSync(srd('99_Old', 'gone.md'), 'old');
    await downloadSrd('5.1', fixture);
    expect(fs.existsSync(srd('99_Old'))).toBe(false);
  });

  it('a failed download leaves the previous SRD untouched', async () => {
    await downloadSrd('5.1', fixture);
    await expect(downloadSrd('5.2.1', async () => Buffer.from('<html>'))).rejects.toBeInstanceOf(CampaignError);
    expect(fs.existsSync(srd('01_Races', 'Elf.md'))).toBe(true);
    expect(getField(bible(), 'Campaign', 'Rules edition')).toBe('SRD 5.1');
    expect(fs.readdirSync(srd()).filter(n => n.startsWith('.'))).toEqual([]);
  });

  it('"none" only records the choice', () => {
    setNoSrd();
    expect(getField(bible(), 'Campaign', 'Rules edition')).toBe('none');
    expect(fs.readdirSync(srd())).toEqual(['README.md']);
  });
});
