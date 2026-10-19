import fs from 'fs';
import path from 'path';
import { getCampaignRoot } from './vault';

// What the app can ingest and where each one stands. A source is a session recap in
// raw/sessions/, the initial design (the undated files of raw/worldbuilding/), or one
// dated design file written after play started. It is ingested once wiki/log.md names
// it, in progress while the app holds an open ingest for it.

export type SourceKind = 'session' | 'design-initial' | 'design';

export interface SourceInfo {
  id: string; // "session-03", "design-initial", "design-2026-10-20-the-frozen-north"
  kind: SourceKind;
  title: string;
  files: string[]; // campaign-relative
  status: 'not-ingested' | 'in-progress' | 'ingested' | 'invalid-name';
}

export const INGEST_DIR = '.dm-second-brain/ingest';
const OPEN_PHASES = ['discuss', 'working', 'review'];
const WORLDBUILDING = 'raw/worldbuilding';
const DATED = /^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.md$/;
const STARTS_DATED = /^\d{4}-\d{2}-\d{2}/;

// Only these ids cross the API; an invalid name's display id ("design-invalid-0") does not
export const isSourceId = (id: string) => /^(session-\d+|design-initial|design-\d{4}-\d{2}-\d{2}-[a-z0-9-]+)$/.test(id);

export const kindOf = (id: string): SourceKind => (id.startsWith('session-') ? 'session' : id === 'design-initial' ? 'design-initial' : 'design');

const sessionNumber = (id: string) => Number(id.slice('session-'.length));

function sessionIds(): string[] {
  const dir = path.join(getCampaignRoot(), 'raw', 'sessions');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map(f => /^(session-\d+)\.md$/.exec(f)?.[1])
    .filter((id): id is string => !!id)
    .sort((a, b) => sessionNumber(a) - sessionNumber(b));
}

// raw/worldbuilding/: the undated files (initial design), the dated ones, and dated-looking
// files with a name the app can't use as an id
function worldbuildingFiles(): { initial: string[]; dated: string[]; invalid: string[] } {
  const dir = path.join(getCampaignRoot(), WORLDBUILDING);
  const out = { initial: [] as string[], dated: [] as string[], invalid: [] as string[] };
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { recursive: true }).map(String).sort()) {
    const rel = entry.split(path.sep).join('/');
    if (!rel.endsWith('.md') || path.basename(rel) === 'README.md' || !fs.statSync(path.join(dir, entry)).isFile()) continue;
    const topLevel = !rel.includes('/');
    if (topLevel && DATED.test(rel)) out.dated.push(rel);
    else if (topLevel && STARTS_DATED.test(rel)) out.invalid.push(rel);
    else out.initial.push(rel);
  }
  return out;
}

function readLog(): string {
  const log = path.join(getCampaignRoot(), 'wiki', 'log.md');
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf-8') : '';
}

const sessionFile = (id: string) => `raw/sessions/${id}.md`;
const designFile = (id: string) => `${WORLDBUILDING}/${id.slice('design-'.length)}.md`;

// The log line of each kind: "## [<date> | session-NN] ingest — …" (older lines name the
// file), "## [design] design — … (raw/worldbuilding/<file>)" for a dated file, and for the
// initial design any design line that names no dated file
function isLogged(log: string, id: string): boolean {
  const kind = kindOf(id);
  if (kind === 'session') return log.includes(`| ${id}]`) || log.includes(sessionFile(id));
  if (kind === 'design') return log.includes(designFile(id));
  return log
    .split('\n')
    .some(l => /^## \[[^\]]*\] design —/.test(l) && !new RegExp(`${WORLDBUILDING}/\\d{4}-\\d{2}-\\d{2}-`).test(l));
}

export const isSourceIngested = (id: string) => isLogged(readLog(), id);

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
  return fs.readdirSync(dir).find(id => isSourceId(id) && OPEN_PHASES.includes(phaseOf(id) ?? '')) ?? null;
}

// Sessions first (numeric order), then design: the initial design, the dated files in
// date order, then the files with an invalid name
export function listSources(): SourceInfo[] {
  const log = readLog();
  const open = openIngest();
  const status = (id: string): SourceInfo['status'] => (isLogged(log, id) ? 'ingested' : id === open ? 'in-progress' : 'not-ingested');
  const wb = worldbuildingFiles();
  const sources: SourceInfo[] = sessionIds().map(id => ({
    id, kind: 'session', title: `Session ${sessionNumber(id)}`, files: [sessionFile(id)], status: status(id),
  }));
  if (wb.initial.length) {
    sources.push({
      id: 'design-initial', kind: 'design-initial', title: 'Initial design',
      files: wb.initial.map(f => `${WORLDBUILDING}/${f}`), status: status('design-initial'),
    });
  }
  for (const f of wb.dated) {
    const [, date, slug] = DATED.exec(f)!;
    const id = `design-${date}-${slug}`;
    sources.push({ id, kind: 'design', title: `${date} · ${slug}`, files: [`${WORLDBUILDING}/${f}`], status: status(id) });
  }
  wb.invalid.forEach((f, i) =>
    sources.push({ id: `design-invalid-${i}`, kind: 'design', title: f, files: [`${WORLDBUILDING}/${f}`], status: 'invalid-name' }),
  );
  return sources;
}

export const getSource = (id: string) => listSources().find(s => s.id === id) ?? null;

// The files a source reads, from its id alone (a session or dated file may be gone)
export function sourceFiles(id: string): string[] {
  const kind = kindOf(id);
  if (kind === 'session') return [sessionFile(id)];
  if (kind === 'design') return [designFile(id)];
  return worldbuildingFiles().initial.map(f => `${WORLDBUILDING}/${f}`);
}

const queueOf = (s: SourceInfo) => (s.kind === 'session' ? 'session' : 'design');

// One ingest at a time, each queue in order; the two queues don't block each other.
// The open ingest is resumed, never restarted.
export function canStart(id: string): { ok: true } | { ok: false; reason: string } {
  const sources = listSources();
  const source = sources.find(s => s.id === id);
  if (!source) return { ok: false, reason: `There is no ${id}.` };
  if (source.status === 'invalid-name') {
    return { ok: false, reason: `${source.files[0]} has an invalid name: rename it YYYY-MM-DD-<slug>.md` };
  }
  if (source.status === 'ingested') return { ok: false, reason: `${id} is already ingested` };
  const open = openIngest();
  if (open) return { ok: false, reason: `${open} is in progress` };
  const queue = sources.filter(s => queueOf(s) === queueOf(source) && s.status !== 'invalid-name');
  const earlier = queue.slice(0, queue.indexOf(source)).find(s => s.status !== 'ingested');
  if (earlier) return { ok: false, reason: `ingest ${earlier.id} first` };
  return { ok: true };
}

// Written by apply when the agent's log entry wasn't approved, so the source reads as ingested
export function fallbackLogLine(id: string): string {
  const kind = kindOf(id);
  if (kind === 'session') return `## [unknown date | ${id}] ingest — applied from the app (${sessionFile(id)})`;
  return `## [design] design — applied from the app (${kind === 'design' ? designFile(id) : `${WORLDBUILDING}/`})`;
}

// The same ingest from a terminal with Claude Code
export function terminalCommand(id: string): string {
  const kind = kindOf(id);
  if (kind === 'session') return `claude "ingest ${sessionFile(id)}"`;
  return `claude "design ingest of ${kind === 'design' ? designFile(id) : WORLDBUILDING}"`;
}
