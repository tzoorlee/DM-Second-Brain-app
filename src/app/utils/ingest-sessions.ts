import fs from 'fs';
import path from 'path';
import { getCampaignRoot } from './vault';

// The session recaps in raw/sessions/ and where each one stands: ingested once
// wiki/log.md names it, in progress while the app holds an open ingest for it.

export interface SessionInfo {
  id: string; // "session-03"
  n: number;
  file: string; // "raw/sessions/session-03.md"
  status: 'not-ingested' | 'in-progress' | 'ingested';
}

export const INGEST_DIR = '.dm-second-brain/ingest';
const OPEN_PHASES = ['discuss', 'working', 'review'];

export const sessionFile = (id: string) => `raw/sessions/${id}.md`;

function sessionIds(): string[] {
  const dir = path.join(getCampaignRoot(), 'raw', 'sessions');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map(f => /^(session-\d+)\.md$/.exec(f)?.[1])
    .filter((id): id is string => !!id)
    .sort((a, b) => numberOf(a) - numberOf(b));
}

const numberOf = (id: string) => Number(id.slice('session-'.length));

function readLog(): string {
  const log = path.join(getCampaignRoot(), 'wiki', 'log.md');
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf-8') : '';
}

// The INGEST log line is "## [<date> | session-NN] ingest — …"; older lines name the file
const isLogged = (log: string, id: string) => log.includes(`| ${id}]`) || log.includes(sessionFile(id));

export const isSessionIngested = (id: string) => isLogged(readLog(), id);

function phaseOf(id: string): string | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(getCampaignRoot(), INGEST_DIR, id, 'state.json'), 'utf-8')).phase ?? null;
  } catch {
    return null;
  }
}

export function openIngest(): string | null {
  const dir = path.join(getCampaignRoot(), INGEST_DIR);
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).find(id => /^session-\d+$/.test(id) && OPEN_PHASES.includes(phaseOf(id) ?? '')) ?? null;
}

export function listSessions(): SessionInfo[] {
  const log = readLog();
  const open = openIngest();
  return sessionIds().map(id => ({
    id,
    n: numberOf(id),
    file: sessionFile(id),
    status: isLogged(log, id) ? 'ingested' : id === open ? 'in-progress' : 'not-ingested',
  }));
}

// One ingest at a time, in session order. The open ingest is resumed, never restarted.
export function canStart(id: string): { ok: true } | { ok: false; reason: string } {
  const sessions = listSessions();
  const at = sessions.findIndex(s => s.id === id);
  if (at === -1) return { ok: false, reason: `There is no ${id}.` };
  if (sessions[at].status === 'ingested') return { ok: false, reason: `${id} is already ingested` };
  const open = openIngest();
  if (open) return { ok: false, reason: `${open} is in progress` };
  const earlier = sessions.slice(0, at).find(s => s.status !== 'ingested');
  if (earlier) return { ok: false, reason: `ingest ${earlier.id} first` };
  return { ok: true };
}
