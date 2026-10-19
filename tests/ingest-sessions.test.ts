import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { canStart, isSessionIngested, listSessions, openIngest } from '../src/app/utils/ingest-sessions';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

let root: string;

const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const setPhase = (id: string, phase: string) => write(`.dm-second-brain/ingest/${id}/state.json`, JSON.stringify({ id, phase }));

describe('Ingest sessions', () => {
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
    expect(listSessions()).toEqual([
      { id: 'session-01', n: 1, file: 'raw/sessions/session-01.md', status: 'ingested' },
      { id: 'session-02', n: 2, file: 'raw/sessions/session-02.md', status: 'ingested' },
      { id: 'session-03', n: 3, file: 'raw/sessions/session-03.md', status: 'in-progress' },
      { id: 'session-04', n: 4, file: 'raw/sessions/session-04.md', status: 'not-ingested' },
      { id: 'session-10', n: 10, file: 'raw/sessions/session-10.md', status: 'not-ingested' },
    ]);
  });

  it('knows ingested sessions by log tag or file path', () => {
    expect(isSessionIngested('session-01')).toBe(true);
    expect(isSessionIngested('session-02')).toBe(true);
    expect(isSessionIngested('session-03')).toBe(false);
    // session-1 must not match session-10
    write('wiki/log.md', '## [x | session-10] ingest\n');
    expect(isSessionIngested('session-01')).toBe(false);
  });

  it('finds the open ingest; applied and discarded ones are closed', () => {
    expect(openIngest()).toBe('session-03');
    setPhase('session-03', 'discarded');
    expect(openIngest()).toBeNull();
    expect(listSessions()[2].status).toBe('not-ingested');
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
});
