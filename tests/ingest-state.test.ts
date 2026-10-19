import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  discardIngest, isWikiPath, resolveForIngest, loadIngest, newIngest, readWikiPage, saveIngest, stagedPaths, stageMove, stagePage,
} from '../src/app/utils/ingest-state';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

let root: string;
const ID = 'session-03';
const dir = () => path.join(root, '.dm-second-brain', 'ingest', ID);
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const mtime = (rel: string) => fs.statSync(path.join(root, rel)).mtimeMs;

describe('Ingest state', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    process.env.VAULT_PATH = root;
    write(`raw/sessions/${ID}.md`, '# Session 3\n');
    write('wiki/npcs/hilda.md', '---\ntype: npc\n---\n# Hilda\n');
    write('wiki/quests/active/crypt.md', '---\ntype: quest\n---\n# Crypt\n');
  });

  it('accepts only slug paths inside wiki/', () => {
    for (const ok of ['index.md', 'log.md', 'npcs/hilda.md', 'quests/completed/crypt.md']) expect(isWikiPath(ok)).toBe(true);
    for (const bad of ['../x.md', 'Wiki/A.md', 'npcs/Hilda.md', 'npcs/hilda.txt', '/etc/x.md', 'a//b.md', 'a/./b.md', 'a\\b.md', '', 'npcs/'])
      expect(isWikiPath(bad)).toBe(false);
  });

  it('writes only its own files and wiki pages', () => {
    for (const bad of ['raw/world-bible.md', 'CLAUDE.md', '.dm-second-brain/studio/step-1.json', 'wiki/../x.md', 'wiki/A.md'])
      expect(() => resolveForIngest(bad)).toThrow();
    expect(resolveForIngest('wiki/npcs/a.md')).toBe(path.join(root, 'wiki', 'npcs', 'a.md'));
  });

  it('starts in discuss with the recap mtime and saves/loads', () => {
    const s = newIngest(ID);
    expect(s).toMatchObject({ id: ID, phase: 'discuss', messages: [], changes: [], summary: null, reads: {}, rounds: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
    expect(s.sourceMtime).toBe(mtime(`raw/sessions/${ID}.md`));
    expect(loadIngest(ID)).toEqual(s);
    s.phase = 'working';
    saveIngest(s);
    expect(loadIngest(ID)?.phase).toBe('working');
    expect(loadIngest('session-09')).toBeNull();
  });

  it('reads staged before real and records the real mtime once', () => {
    const s = newIngest(ID);
    expect(readWikiPage(s, 'npcs/hilda.md')).toContain('# Hilda');
    const first = s.reads['npcs/hilda.md'];
    expect(first).toBe(mtime('wiki/npcs/hilda.md'));
    fs.utimesSync(path.join(root, 'wiki/npcs/hilda.md'), new Date(), new Date(Date.now() + 5000));
    readWikiPage(s, 'npcs/hilda.md');
    expect(s.reads['npcs/hilda.md']).toBe(first);
    stagePage(s, 'npcs/hilda.md', '---\ntype: npc\n---\n# Hilda (scarred)\n');
    expect(readWikiPage(s, 'npcs/hilda.md')).toContain('scarred');
    expect(readWikiPage(s, 'npcs/nobody.md')).toBeNull();
    expect(fs.readFileSync(path.join(root, 'wiki/npcs/hilda.md'), 'utf-8')).not.toContain('scarred');
  });

  it('stages new and changed pages; a rewrite resets the review', () => {
    const s = newIngest(ID);
    expect(stagePage(s, 'npcs/brother-aldric.md', 'x')).toEqual({ path: 'npcs/brother-aldric.md', kind: 'new', review: 'pending' });
    const changed = stagePage(s, 'npcs/hilda.md', 'y');
    expect(changed.kind).toBe('changed');
    s.changes[1] = { ...s.changes[1], review: 'approved', note: 'old note' };
    expect(stagePage(s, 'npcs/hilda.md', 'z')).toEqual({ path: 'npcs/hilda.md', kind: 'changed', review: 'pending' });
    expect(s.changes).toHaveLength(2);
    expect(fs.readFileSync(path.join(dir(), 'staged/npcs/hilda.md'), 'utf-8')).toBe('z');
    expect(stagedPaths(s)).toEqual(['npcs/brother-aldric.md', 'npcs/hilda.md']);
    expect(() => stagePage(s, '../evil.md', 'x')).toThrow();
  });

  it('moves a page into staging and refuses to overwrite', () => {
    const s = newIngest(ID);
    expect(stageMove(s, 'quests/active/crypt.md', 'quests/completed/crypt.md')).toEqual({
      path: 'quests/completed/crypt.md', kind: 'moved', from: 'quests/active/crypt.md', review: 'pending',
    });
    expect(readWikiPage(s, 'quests/completed/crypt.md')).toContain('# Crypt');
    expect(readWikiPage(s, 'quests/active/crypt.md')).toBeNull();
    expect(s.reads['quests/active/crypt.md']).toBe(mtime('wiki/quests/active/crypt.md'));
    // a rewrite of the moved page keeps it a move
    expect(stagePage(s, 'quests/completed/crypt.md', 'done').kind).toBe('moved');
    // destination exists in the real wiki, or is already staged
    expect(() => stageMove(s, 'npcs/hilda.md', 'quests/completed/crypt.md')).toThrow(/exists/);
    write('wiki/npcs/hilda-old.md', 'x');
    expect(() => stageMove(s, 'npcs/hilda.md', 'npcs/hilda-old.md')).toThrow(/exists/);
    expect(() => stageMove(s, 'npcs/ghost.md', 'npcs/ghost-2.md')).toThrow(/no page/i);
  });

  it('moving a new page just renames it', () => {
    const s = newIngest(ID);
    stagePage(s, 'npcs/cultist.md', 'c');
    stageMove(s, 'npcs/cultist.md', 'npcs/brother-varn.md');
    expect(s.changes).toEqual([{ path: 'npcs/brother-varn.md', kind: 'new', review: 'pending' }]);
    expect(fs.existsSync(path.join(dir(), 'staged/npcs/cultist.md'))).toBe(false);
  });

  it('discards: phase discarded, staged deleted', () => {
    const s = newIngest(ID);
    stagePage(s, 'npcs/x.md', 'x');
    discardIngest(s);
    expect(loadIngest(ID)?.phase).toBe('discarded');
    expect(fs.existsSync(path.join(dir(), 'staged'))).toBe(false);
  });
});
