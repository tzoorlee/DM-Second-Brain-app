import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestState, newIngest, readStaged } from '../src/app/utils/ingest-state';
import { runTool, toolsFor } from '../src/app/utils/ingest-tools';
import { isolateEnv, makeCampaign, makeTempDir, writePage } from './helpers';

let root: string;
let s: IngestState;
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const page = (title: string, extra = '') => `---\ntype: npc\nname: "${title}"\n---\n\n# ${title}\n${extra}`;

describe('Ingest tools', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    process.env.VAULT_PATH = root;
    write('raw/sessions/session-03.md', '# Session 3\nThe party returns to the crypt.\n');
    write('raw/world-bible.md', '# World Bible\n');
    write('raw/srd/01_Races/Elf.md', '# Elf\n');
    write('wiki/log.md', '# Log\n\n## [2026-01-01 | session-01] ingest — x\n');
    writePage(root, 'npcs/hilda.md', { type: 'npc', name: 'Hilda' }, '# Hilda\nKeeps the Rusty Tankard tavern.');
    writePage(root, 'quests/active/crypt.md', { type: 'quest', name: 'The Crypt' }, '# The Crypt');
    write('wiki/npcs/_template-npc.md', 'template');
    s = newIngest('session-03');
  });

  it('sends one tool list in both phases (thinking blocks are bound to it), refusing writes while discussing', () => {
    const names = (phase: Parameters<typeof toolsFor>[0]) => toolsFor(phase).map(t => t.name);
    expect(names('discuss')).toEqual(names('working'));
    expect(names('working')).toEqual(['read_source', 'list_pages', 'search_wiki', 'read_page', 'write_page', 'move_page', 'append_log', 'finish']);
    expect(names('review')).toEqual([]);
    expect(toolsFor('working').every(t => t.strict)).toBe(true);
    // the discuss phase refuses write tools even if asked
    s.phase = 'discuss';
    expect(runTool(s, 'write_page', { path: 'npcs/x.md', content: page('X') })).toMatchObject({ isError: true, content: expect.stringMatching(/Proceed/) });
    expect(s.changes).toEqual([]);
  });

  it('reads sources', () => {
    expect(runTool(s, 'read_source', { file: 'session' }).content).toContain('returns to the crypt');
    expect(runTool(s, 'read_source', { file: 'world-bible' }).content).toContain('# World Bible');
    expect(runTool(s, 'read_source', { file: 'house-rules' }).content).toMatch(/no raw\/house-rules\.md/);
    expect(runTool(s, 'read_source', { file: 'srd/01_Races/Elf.md' }).content).toContain('# Elf');
    expect(runTool(s, 'read_source', { file: 'srd/01_Races' }).content).toContain('01_Races/Elf.md');
    expect(runTool(s, 'read_source', { file: 'srd/../world-bible.md' }).isError).toBe(true);
    expect(runTool(s, 'read_source', { file: 'sessions/session-01.md' }).isError).toBe(true);
  });

  it('lists, searches and reads pages, staged ones included', () => {
    s.phase = 'working';
    runTool(s, 'write_page', { path: 'npcs/brother-varn.md', content: page('Brother Varn', 'A cultist of the Order.') });
    expect(runTool(s, 'list_pages', { folder: 'npcs' }).content.split('\n')).toEqual(['npcs/brother-varn.md (staged)', 'npcs/hilda.md']);
    expect(runTool(s, 'list_pages', { folder: '' }).content).toContain('quests/active/crypt.md');
    expect(runTool(s, 'list_pages', { folder: '' }).content).not.toContain('_template');
    expect(runTool(s, 'list_pages', { folder: '' }).content.split('\n')).toContain('log.md');
    expect(runTool(s, 'search_wiki', { query: 'tankard' }).content).toContain('npcs/hilda.md — Hilda');
    expect(runTool(s, 'search_wiki', { query: 'cultist' }).content).toContain('npcs/brother-varn.md (staged)');
    expect(runTool(s, 'read_page', { path: 'npcs/hilda.md' }).content).toContain('Rusty Tankard');
    expect(runTool(s, 'read_page', { path: 'npcs/brother-varn.md' }).content).toContain('cultist');
    expect(runTool(s, 'read_page', { path: 'npcs/nobody.md' }).isError).toBe(true);
  });

  it('checks pages before staging them', () => {
    s.phase = 'working';
    const bad = (p: string, content: string) => {
      const r = runTool(s, 'write_page', { path: p, content });
      expect(r.isError).toBe(true);
      expect(s.changes.find(c => c.path === p)).toBeUndefined();
      return r.content;
    };
    expect(bad('NPCs/x.md', page('X'))).toMatch(/wiki path/);
    expect(bad('npcs/x.md', '---\ntype: [npc\n---\n# X\n')).toMatch(/frontmatter/i);
    expect(bad('npcs/x.md', '---\nname: X\n---\n# X\n')).toMatch(/type/);
    expect(bad('npcs/x.md', '# X\n')).toMatch(/type/);
    expect(bad('npcs/x.md', page('X', '\n## Segreti (solo DM)\nShh.\n'))).toContain('## Secrets (DM only)');
    // DM-only text the app would not hide from players
    for (const heading of ['### Secrets (DM only)', '## Secrets', '**Secrets (DM only)**', '#### DM notes'])
      expect(bad('npcs/x.md', page('X', `\n${heading}\nShh.\n`))).toContain('## Secrets (DM only)');
    // a secret page's own sections are fine
    expect(runTool(s, 'write_page', { path: 'secrets/plot.md', content: '---\ntype: secret\n---\n# Plot\n\n## The Secret\nShh.\n' }).isError).toBeFalsy();
    const ok = runTool(s, 'write_page', { path: 'npcs/x.md', content: page('X', '\n## Secrets (DM only)\nShh.\n') });
    expect(ok.isError).toBeFalsy();
    expect(ok.staged).toEqual({ path: 'npcs/x.md', kind: 'new', review: 'pending' });
    // index.md needs no frontmatter
    expect(runTool(s, 'write_page', { path: 'index.md', content: '# Index\n' }).staged?.kind).toBe('new');
  });

  it('refuses to rewrite an existing page it has not read', () => {
    s.phase = 'working';
    const blind = runTool(s, 'write_page', { path: 'npcs/hilda.md', content: page('Hilda') });
    expect(blind).toMatchObject({ isError: true, content: expect.stringMatching(/read_page/) });
    runTool(s, 'read_page', { path: 'npcs/hilda.md' });
    expect(runTool(s, 'write_page', { path: 'npcs/hilda.md', content: page('Hilda') }).isError).toBeFalsy();
  });

  it('appends log lines to a staged copy of the real log', () => {
    s.phase = 'working';
    expect(runTool(s, 'append_log', { line: 'session 3 ingested' }).isError).toBe(true);
    runTool(s, 'append_log', { line: '## [2026-02-01 | session-03] ingest — the crypt again' });
    const r = runTool(s, 'append_log', { line: '## [2026-02-01 | session-03] lint — fixed links' });
    expect(r.staged).toEqual({ path: 'log.md', kind: 'changed', review: 'pending' });
    const log = readStaged(s, 'log.md')!;
    expect(log).toContain('## [2026-01-01 | session-01] ingest — x');
    expect(log).toContain('session-03] ingest — the crypt again');
    expect(log).toContain('session-03] lint — fixed links');
    expect(fs.readFileSync(path.join(root, 'wiki/log.md'), 'utf-8')).not.toContain('session-03');
  });

  it('moves pages, refusing an existing destination', () => {
    s.phase = 'working';
    writePage(root, 'quests/completed/crypt.md', { type: 'quest' }, '# Old');
    expect(runTool(s, 'move_page', { from: 'quests/active/crypt.md', to: 'quests/completed/crypt.md' }).isError).toBe(true);
    const r = runTool(s, 'move_page', { from: 'quests/active/crypt.md', to: 'quests/completed/the-crypt.md' });
    expect(r.staged).toMatchObject({ kind: 'moved', from: 'quests/active/crypt.md' });
  });

  it('finish returns the summary; unknown tools are errors', () => {
    s.phase = 'working';
    expect(runTool(s, 'finish', { summary: 'Two new NPCs.' })).toMatchObject({ finished: 'Two new NPCs.' });
    expect(runTool(s, 'delete_everything', {}).isError).toBe(true);
  });
});
