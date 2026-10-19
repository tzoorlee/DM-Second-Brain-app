import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { INGEST_DIR, sessionFile } from './ingest-sessions';
import { writeFileAtomic } from './studio-steps';
import { getCampaignRoot } from './vault';

// One ingest per session in .dm-second-brain/ingest/session-NN/: state.json and
// staged/, a mirror of wiki/ holding only the pages the agent wrote. The real wiki
// is never written here: only applyIngest does that, after the DM's review.

export type IngestPhase = 'discuss' | 'working' | 'review' | 'applied' | 'discarded';

export interface Change {
  path: string;
  kind: 'new' | 'changed' | 'moved';
  from?: string;
  review: 'pending' | 'approved' | 'rejected';
  note?: string;
}

export interface IngestState {
  id: string;
  phase: IngestPhase;
  messages: Anthropic.Beta.Messages.BetaMessageParam[];
  changes: Change[];
  summary: string | null;
  // cacheWrite: tokens written to the prompt cache, billed above plain input
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  // The recap's mtime when the ingest started
  sourceMtime: number;
  // wiki path → the real file's mtime when the agent first read it
  reads: Record<string, number>;
  rounds: number;
}

// Relative to wiki/: slug segments and a .md file, so index.md and log.md pass
export const isWikiPath = (p: string) => /^[a-z0-9-]+(\/[a-z0-9-]+)*\.md$/.test(p);

// The only files the ingest may write, relative to the campaign root. Kept apart from
// the Studio's list: the Studio never writes wiki/.
const ALLOWED = [
  /^\.dm-second-brain\/ingest\/session-\d+\/(state\.json|staged\/[a-z0-9/-]+\.md)$/,
  /^\.dm-second-brain\/TEMPLATES\.md$/,
  /^wiki\/[a-z0-9/-]+\.md$/,
];

export function resolveForIngest(rel: string): string {
  const parts = rel.split('/');
  if (parts.some(p => p === '..' || p === '.' || p === '') || !ALLOWED.some(r => r.test(rel))) {
    throw new Error(`The ingest may not write "${rel}".`);
  }
  return path.join(getCampaignRoot(), ...parts);
}

function checkPath(p: string) {
  if (!isWikiPath(p)) throw new Error(`"${p}" is not a wiki path: use lowercase slugs relative to wiki/, like npcs/hilda.md.`);
}

const stateFile = (id: string) => resolveForIngest(`${INGEST_DIR}/${id}/state.json`);
const stagedFile = (id: string, p: string) => resolveForIngest(`${INGEST_DIR}/${id}/staged/${p}`);
const stagedDir = (id: string) => path.join(getCampaignRoot(), INGEST_DIR, id, 'staged');
export const realFile = (p: string) => resolveForIngest(`wiki/${p}`);

export function newIngest(id: string): IngestState {
  fs.rmSync(stagedDir(id), { recursive: true, force: true });
  const s: IngestState = {
    id, phase: 'discuss', messages: [], changes: [], summary: null,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    sourceMtime: fs.statSync(path.join(getCampaignRoot(), sessionFile(id))).mtimeMs,
    reads: {}, rounds: 0,
  };
  saveIngest(s);
  return s;
}

export function loadIngest(id: string): IngestState | null {
  try {
    return JSON.parse(fs.readFileSync(stateFile(id), 'utf-8')) as IngestState;
  } catch {
    return null;
  }
}

export function saveIngest(s: IngestState): void {
  writeFileAtomic(stateFile(s.id), JSON.stringify(s, null, 2) + '\n');
}

export function readStaged(s: IngestState, p: string): string | null {
  const file = stagedFile(s.id, p);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

export function readReal(p: string): string | null {
  const file = realFile(p);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

// What the agent sees: its own staged version first, then the real wiki. A page it
// moved away is gone. The first real read records the file's mtime for apply's conflict check.
export function readWikiPage(s: IngestState, p: string): string | null {
  checkPath(p);
  const staged = readStaged(s, p);
  if (staged !== null) return staged;
  if (s.changes.some(c => c.kind === 'moved' && c.from === p)) return null;
  const real = readReal(p);
  if (real !== null && s.reads[p] === undefined) s.reads[p] = fs.statSync(realFile(p)).mtimeMs;
  return real;
}

export function stagePage(s: IngestState, p: string, content: string): Change {
  checkPath(p);
  writeFileAtomic(stagedFile(s.id, p), content);
  const existing = s.changes.find(c => c.path === p);
  if (existing) {
    delete existing.note;
    existing.review = 'pending';
    return { ...existing };
  }
  const change: Change = { path: p, kind: readReal(p) === null ? 'new' : 'changed', review: 'pending' };
  s.changes.push(change);
  return { ...change };
}

export function stageMove(s: IngestState, from: string, to: string): Change {
  checkPath(from);
  checkPath(to);
  const content = readWikiPage(s, from);
  if (content === null) throw new Error(`There is no page at ${from}.`);
  if (readReal(to) !== null || readStaged(s, to) !== null) throw new Error(`${to} already exists: pick another path or rewrite that page.`);
  writeFileAtomic(stagedFile(s.id, to), content);
  fs.rmSync(stagedFile(s.id, from), { force: true });
  const previous = s.changes.find(c => c.path === from);
  s.changes = s.changes.filter(c => c !== previous);
  // A new page only changes name; a page moved twice keeps its original origin
  const change: Change =
    previous?.kind === 'new'
      ? { path: to, kind: 'new', review: 'pending' }
      : { path: to, kind: 'moved', from: previous?.kind === 'moved' ? previous.from : from, review: 'pending' };
  s.changes.push(change);
  return { ...change };
}

export const stagedPaths = (s: IngestState) => s.changes.map(c => c.path).sort();

export function discardIngest(s: IngestState): void {
  fs.rmSync(stagedDir(s.id), { recursive: true, force: true });
  s.phase = 'discarded';
  saveIngest(s);
}
