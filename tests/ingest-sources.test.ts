import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { canStart, fallbackLogLine, isSourceId, isSourceIngested, listSources, openIngest, terminalCommand } from '../src/app/utils/ingest-sources';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

let root: string;

const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const setPhase = (id: string, phase: string) => write(`.dm-second-brain/ingest/${id}/state.json`, JSON.stringify({ id, phase }));

describe('Ingest sources', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    process.env.VAULT_PATH = root;
    for (const n of ['10', '01', '02', '03', '04']) write(`raw/sessions/session-${n}.md`, `# Session ${n}\n`);
    write('raw/sessions/README.md', 'readme');
    write(
      'wiki/log.md',
      '# Log\n\n## [2026-01-01 | session-01] ingest — the crypt\n\n## [2026-01-08] ingest — raw/sessions/session-02.md\n',
    );
    setPhase('session-03', 'working');
  });

  it('lists sessions in numeric order with their status', () => {
    const session = (n: string, status: string) => ({
      id: `session-${n}`, kind: 'session', title: `Session ${Number(n)}`, files: [`raw/sessions/session-${n}.md`], status,
    });
    expect(listSources()).toEqual([
      session('01', 'ingested'), session('02', 'ingested'), session('03', 'in-progress'), session('04', 'not-ingested'), session('10', 'not-ingested'),
    ]);
  });

  it('knows ingested sessions by log tag or file path', () => {
    expect(isSourceIngested('session-01')).toBe(true);
    expect(isSourceIngested('session-02')).toBe(true);
    expect(isSourceIngested('session-03')).toBe(false);
    // session-1 must not match session-10
    write('wiki/log.md', '## [x | session-10] ingest\n');
    expect(isSourceIngested('session-01')).toBe(false);
  });

  it('finds the open ingest; applied and discarded ones are closed', () => {
    expect(openIngest()).toBe('session-03');
    setPhase('session-03', 'discarded');
    expect(openIngest()).toBeNull();
    expect(listSources()[2].status).toBe('not-ingested');
  });

  it('starts sessions only in order and one at a time', () => {
    expect(canStart('session-04')).toEqual({ ok: false, reason: 'session-03 is in progress' });
    expect(canStart('session-01')).toEqual({ ok: false, reason: 'session-01 is already ingested' });
    expect(canStart('session-07')).toEqual({ ok: false, reason: 'There is no session-07.' });
    setPhase('session-03', 'discarded');
    expect(canStart('session-04')).toEqual({ ok: false, reason: 'ingest session-03 first' });
    expect(canStart('session-03')).toEqual({ ok: true });
  });

  it('does not restart the open ingest: it is resumed instead', () => {
    expect(canStart('session-03')).toEqual({ ok: false, reason: 'session-03 is in progress' });
  });

  describe('design', () => {
    const files = ['regions.md', 'lore/Old Gods.md', 'README.md', '2026-10-20-the-frozen-north.md', '2026-10-05-the-old-mill.md', '2026-10-21-Bad Name.md'];
    beforeEach(() => {
      for (const f of files) write(`raw/worldbuilding/${f}`, `# ${f}\n`);
      setPhase('session-03', 'discarded');
    });
    const design = () => listSources().filter(s => s.kind !== 'session');

    it('lists undated files (subfolders too, README out) as the initial design and dated files in date order', () => {
      expect(design().map(s => s.id)).toEqual(['design-initial', 'design-2026-10-05-the-old-mill', 'design-2026-10-20-the-frozen-north', 'design-invalid-0']);
      expect(design()[0]).toEqual({
        id: 'design-initial', kind: 'design-initial', title: 'Initial design', status: 'not-ingested',
        files: ['raw/worldbuilding/lore/Old Gods.md', 'raw/worldbuilding/regions.md'],
      });
      expect(design()[1]).toMatchObject({ kind: 'design', title: '2026-10-05 · the-old-mill', files: ['raw/worldbuilding/2026-10-05-the-old-mill.md'] });
      expect(design()[3]).toMatchObject({ status: 'invalid-name', files: ['raw/worldbuilding/2026-10-21-Bad Name.md'] });
      expect(canStart('design-invalid-0').ok).toBe(false);
      expect(isSourceId('design-invalid-0')).toBe(false);
      for (const id of ['session-3', 'design-initial', 'design-2026-10-05-the-old-mill']) expect(isSourceId(id)).toBe(true);
      for (const id of ['design-../x', 'design-2026-1-1-x', 'design-', 'Design-initial', 'design-2026-10-05-Old']) expect(isSourceId(id)).toBe(false);
    });

    it('detects the initial design from a terminal log line, not from a dated one', () => {
      write('wiki/log.md', '# Log\n\n## [design] design — Frozen (raw/worldbuilding/2026-10-20-the-frozen-north.md)\n');
      expect(isSourceIngested('design-initial')).toBe(false);
      expect(isSourceIngested('design-2026-10-20-the-frozen-north')).toBe(true);
      write('wiki/log.md', '# Log\n\n## [design] design — World of Eldoria\n');
      expect(isSourceIngested('design-initial')).toBe(true);
    });

    it('accepts terminal design lines written loosely', () => {
      for (const line of ['## [design] Design - World of Eldoria', '## [design] design – Eldoria', '## [setup]  DESIGN — Eldoria']) {
        write('wiki/log.md', `# Log\n\n${line}\n`);
        expect(isSourceIngested('design-initial')).toBe(true);
      }
      write('wiki/log.md', '# Log\n\n## [x | session-01] ingest — the design of the crypt\n');
      expect(isSourceIngested('design-initial')).toBe(false);
    });

    it('survives a broken symlink in raw/worldbuilding', () => {
      fs.symlinkSync(path.join(root, 'nowhere.md'), path.join(root, 'raw/worldbuilding/broken.md'));
      expect(design().map(s => s.id)).toContain('design-initial');
      expect(design()[0].files).not.toContain('raw/worldbuilding/broken.md');
    });

    it('keeps queues separate, with one open ingest in all', () => {
      expect(canStart('design-initial')).toEqual({ ok: true });
      expect(canStart('design-2026-10-05-the-old-mill')).toEqual({ ok: false, reason: 'ingest design-initial first' });
      setPhase('design-initial', 'working');
      expect(canStart('session-03')).toEqual({ ok: false, reason: 'design-initial is in progress' });
      expect(openIngest()).toBe('design-initial');
    });

    it('has no initial design without undated files', () => {
      for (const f of ['regions.md', 'lore/Old Gods.md']) fs.rmSync(path.join(root, 'raw/worldbuilding', f));
      expect(design()[0].id).toBe('design-2026-10-05-the-old-mill');
      expect(canStart('design-2026-10-05-the-old-mill')).toEqual({ ok: true });
    });

    it('names the fallback log line and the terminal command of each kind', () => {
      expect(fallbackLogLine('design-initial')).toBe('## [design] design — applied from the app (raw/worldbuilding/)');
      expect(fallbackLogLine('design-2026-10-05-the-old-mill')).toBe('## [design] design — applied from the app (raw/worldbuilding/2026-10-05-the-old-mill.md)');
      expect(fallbackLogLine('session-04')).toBe('## [unknown date | session-04] ingest — applied from the app (raw/sessions/session-04.md)');
      expect(terminalCommand('design-initial')).toBe('claude "design ingest of raw/worldbuilding"');
      expect(terminalCommand('design-2026-10-05-the-old-mill')).toBe('claude "design ingest of raw/worldbuilding/2026-10-05-the-old-mill.md"');
      expect(terminalCommand('session-04')).toBe('claude "ingest raw/sessions/session-04.md"');
    });
  });
});
