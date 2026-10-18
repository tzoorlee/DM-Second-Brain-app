import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CampaignError } from '../src/app/utils/campaign-error';
import { createItem, itemStatus, latestSession, listItems } from '../src/app/utils/studio-items';
import { createAnthropicModel } from '../src/app/utils/studio-ai';
import { getStep, readStepContent, resolveInCampaign, writeStepContent } from '../src/app/utils/studio-steps';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

let root: string;
const today = new Date(2027, 2, 5);
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');

function startCampaign() {
  fs.mkdirSync(path.join(root, 'raw', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'raw', 'sessions', 'session-01.md'), '# 1');
  fs.writeFileSync(path.join(root, 'raw', 'sessions', 'session-14.md'), '# 14');
}

describe('Prepare and Interlude items', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    process.env.VAULT_PATH = root;
  });

  it('cannot be created before the first session', () => {
    expect(() => createItem('prepare', 'The Frozen North', {}, today)).toThrow(CampaignError);
  });

  it('knows the latest session', () => {
    expect(latestSession()).toBeNull();
    startCampaign();
    expect(latestSession()).toBe('session-14');
  });

  it('creates a dated preparation with its own number and file', () => {
    startCampaign();
    const item = createItem('prepare', 'The Frozen North', {}, today);
    expect(item).toMatchObject({ n: 101, kind: 'prepare', title: 'The Frozen North', file: 'raw/worldbuilding/2027-03-05-the-frozen-north.md' });
    expect(getStep(101)).toMatchObject({ n: 101, kind: 'prepare', file: item.file, title: 'The Frozen North' });
    expect(readStepContent(101)).toBe('# The Frozen North\n\n');
    expect(listItems().map(i => i.n)).toEqual([101]);
  });

  it('gives a repeated title its own file', () => {
    startCampaign();
    createItem('prepare', 'The Frozen North', {}, today);
    expect(createItem('prepare', 'The Frozen North', {}, today).file).toBe('raw/worldbuilding/2027-03-05-the-frozen-north-2.md');
  });

  it('starts an interlude with its frontmatter', () => {
    startCampaign();
    const item = createItem('interlude', 'The Burning of Ashford', { dateInWorld: '1492-Flamerule-03', afterSession: 'session-14' }, today);
    expect(item.file).toBe('raw/interludes/2027-03-05-the-burning-of-ashford.md');
    expect(readStepContent(item.n)).toBe('---\ndate_in_world: "1492-Flamerule-03"\nafter_session: session-14\n---\n\n# The Burning of Ashford\n\n');
  });

  it('refuses an interlude without its dates', () => {
    startCampaign();
    expect(() => createItem('interlude', 'X', { dateInWorld: '', afterSession: 'session-14' }, today)).toThrow(CampaignError);
    expect(() => createItem('interlude', 'X', { dateInWorld: '1492-Flamerule-03', afterSession: 'yesterday' }, today)).toThrow(CampaignError);
  });

  it('goes from draft to written to ingested', () => {
    startCampaign();
    const item = createItem('interlude', 'Ashford', { dateInWorld: '1492-Flamerule-03', afterSession: 'session-14' }, today);
    expect(itemStatus(item)).toBe('draft');
    expect(writeStepContent(item.n, readStepContent(item.n) + '- It burned.\n')).toEqual([item.file]);
    expect(read(item.file)).toContain('- It burned.');
    expect(itemStatus(item)).toBe('written');
    fs.writeFileSync(path.join(root, 'wiki', 'log.md'), `# Log\n\n## [1492-Flamerule-03 | session-14] interlude — Ashford (${item.file})\n`);
    expect(itemStatus(item)).toBe('ingested');
  });

  it('refuses to rewrite a file the agent already ingested', () => {
    startCampaign();
    const item = createItem('prepare', 'North', {}, today);
    writeStepContent(item.n, '# North\n\n- Ice.\n');
    fs.writeFileSync(path.join(root, 'wiki', 'log.md'), `## [design] design — North (${item.file})\n`);
    expect(() => writeStepContent(item.n, '# North\n\n- Changed.\n')).toThrow(expect.objectContaining({ status: 409 }));
    expect(read(item.file)).toBe('# North\n\n- Ice.\n');
  });

  it('allows writing interludes and refuses unknown item numbers', () => {
    expect(resolveInCampaign('raw/interludes/2027-03-05-x.md')).toBe(path.join(root, 'raw/interludes/2027-03-05-x.md'));
    expect(() => getStep(150)).toThrow();
  });
});

describe('models per mode', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses Opus 5.5 for the steps and Sonnet 5.5 between sessions by default', () => {
    delete process.env.STUDIO_MODEL;
    delete process.env.STUDIO_PREP_MODEL;
    expect(createAnthropicModel('setup').name).toBe('claude-opus-5-5');
    expect(createAnthropicModel('prep').name).toBe('claude-sonnet-5-5');
  });

  it('lets .env.local choose both', () => {
    process.env.STUDIO_MODEL = 'claude-opus-5';
    process.env.STUDIO_PREP_MODEL = 'claude-haiku-5-5';
    expect(createAnthropicModel('setup').name).toBe('claude-opus-5');
    expect(createAnthropicModel('prep').name).toBe('claude-haiku-5-5');
  });
});
