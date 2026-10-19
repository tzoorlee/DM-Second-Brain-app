import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyIngest, approveAll, askChanges, conflicts, linkWarnings, setReview } from '../src/app/utils/ingest-apply';
import { isSourceIngested } from '../src/app/utils/ingest-sources';
import { IngestState, loadIngest, newIngest, saveIngest } from '../src/app/utils/ingest-state';
import { runTool } from '../src/app/utils/ingest-tools';
import { isolateEnv, makeCampaign, makeTempDir, writePage } from './helpers';

let root: string;
let s: IngestState;
const ID = 'session-01';
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const touch = (rel: string, text: string) => {
  fs.writeFileSync(path.join(root, rel), text);
  const later = new Date(Date.now() + 10_000);
  fs.utimesSync(path.join(root, rel), later, later);
};
const page = (title: string, body = '') => `---\ntype: npc\nname: "${title}"\n---\n\n# ${title}\n${body}`;
const tool = (name: string, input: Record<string, string>) => {
  const out = runTool(s, name, input);
  if (out.isError) throw new Error(out.content);
  return out;
};

describe('Ingest review and apply', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test', { index: '# Index\n' });
    process.env.VAULT_PATH = root;
    fs.mkdirSync(path.join(root, 'raw', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'sessions', `${ID}.md`), '# Session 1\n');
    fs.writeFileSync(path.join(root, 'wiki', 'log.md'), '# Log\n');
    writePage(root, 'npcs/hilda.md', { type: 'npc', name: 'Hilda' }, '# Hilda');
    writePage(root, 'quests/active/crypt.md', { type: 'quest', name: 'Crypt' }, '# Crypt');
    s = newIngest(ID);
    s.phase = 'working';
    tool('read_page', { path: 'npcs/hilda.md' });
    tool('read_page', { path: 'index.md' });
    tool('write_page', { path: 'npcs/brother-varn.md', content: page('Brother Varn') });
    tool('write_page', { path: 'npcs/hilda.md', content: page('Hilda', 'Met [[brother-varn|Brother Varn]].') });
    tool('move_page', { from: 'quests/active/crypt.md', to: 'quests/completed/crypt.md' });
    tool('write_page', { path: 'index.md', content: '# Index\n- [[brother-varn]]\n' });
    tool('append_log', { line: `## [1 Hammer | ${ID}] ingest — Varn` });
    s.phase = 'review';
    saveIngest(s);
  });

  it('approves, rejects and asks for changes', () => {
    askChanges(s, 'npcs/hilda.md', 'Add the scar.');
    setReview(s, 'index.md', 'rejected');
    approveAll(s);
    const by = Object.fromEntries(loadIngest(ID)!.changes.map(c => [c.path, c]));
    expect(by['npcs/hilda.md']).toMatchObject({ review: 'pending', note: 'Add the scar.' });
    expect(by['index.md'].review).toBe('rejected');
    expect(by['npcs/brother-varn.md'].review).toBe('approved');
    expect(() => setReview(s, 'npcs/nobody.md', 'approved')).toThrow();
  });

  it('warns about approved pages linking to a rejected new page', () => {
    approveAll(s);
    expect(linkWarnings(s)).toEqual([]);
    setReview(s, 'npcs/brother-varn.md', 'rejected');
    expect(linkWarnings(s)).toEqual([
      { from: 'npcs/hilda.md', to: 'npcs/brother-varn.md' },
      { from: 'index.md', to: 'npcs/brother-varn.md' },
    ]);
  });

  it('reports hand edits made during the ingest as conflicts, index and log included', () => {
    approveAll(s);
    expect(conflicts(s)).toEqual([]);
    touch('wiki/npcs/hilda.md', '---\ntype: npc\n---\n# Hilda (DM edit)\n');
    touch('wiki/log.md', '# Log\n\n## [x | session-00] DM note\n');
    touch('wiki/index.md', '# Index\n- DM line\n');
    expect(conflicts(s).sort()).toEqual(['index.md', 'log.md', 'npcs/hilda.md']);
    expect(() => applyIngest(s)).toThrow(/conflict/i);
    expect(read('wiki/npcs/hilda.md')).toContain('DM edit');
  });

  it('flags a page never read, and a new page the DM created meanwhile', () => {
    s.phase = 'working';
    tool('write_page', { path: 'quests/active/other.md', content: page('Other') });
    s.phase = 'review';
    approveAll(s);
    writePage(root, 'quests/active/other.md', { type: 'quest' }, '# DM made it');
    expect(conflicts(s)).toEqual(['quests/active/other.md']);
  });

  it('keeps theirs or takes the agent\'s on a conflict', () => {
    approveAll(s);
    touch('wiki/npcs/hilda.md', '---\ntype: npc\n---\n# Hilda (DM edit)\n');
    touch('wiki/index.md', '# Index\n- DM line\n');
    applyIngest(s, ['npcs/hilda.md'], ['index.md']);
    expect(read('wiki/npcs/hilda.md')).toContain('DM edit');
    expect(read('wiki/index.md')).toContain('[[brother-varn]]');
  });

  it('applies approved changes and moves, leaves rejected ones out', () => {
    approveAll(s);
    setReview(s, 'npcs/hilda.md', 'rejected');
    const before = new Set(fs.readdirSync(root, { recursive: true }).map(String).filter(f => !f.startsWith('wiki') && !f.startsWith('.dm-second-brain')));
    const result = applyIngest(s);
    expect(result.written.sort()).toEqual(['index.md', 'log.md', 'npcs/brother-varn.md']);
    expect(result.moved).toEqual([{ from: 'quests/active/crypt.md', to: 'quests/completed/crypt.md' }]);
    expect(read('wiki/npcs/brother-varn.md')).toContain('# Brother Varn');
    expect(read('wiki/npcs/hilda.md')).not.toContain('Varn');
    expect(exists('wiki/quests/active/crypt.md')).toBe(false);
    expect(read('wiki/quests/completed/crypt.md')).toContain('# Crypt');
    expect(read('wiki/log.md')).toContain(`| ${ID}] ingest — Varn`);
    expect(isSourceIngested(ID)).toBe(true);
    const after = loadIngest(ID)!;
    expect(after.phase).toBe('applied');
    expect(exists(`.dm-second-brain/ingest/${ID}/staged`)).toBe(false);
    expect(exists(`.dm-second-brain/ingest/${ID}/state.json`)).toBe(true);
    const outside = fs.readdirSync(root, { recursive: true }).map(String).filter(f => !f.startsWith('wiki') && !f.startsWith('.dm-second-brain'));
    expect(new Set(outside)).toEqual(before);
    expect(() => applyIngest(after)).toThrow();
  });

  it('adds a fallback log line when the log was rejected', () => {
    approveAll(s);
    setReview(s, 'log.md', 'rejected');
    applyIngest(s);
    expect(read('wiki/log.md')).toBe(`# Log\n\n## [unknown date | ${ID}] ingest — applied from the app (raw/sessions/${ID}.md)\n`);
    expect(isSourceIngested(ID)).toBe(true);
  });
});
