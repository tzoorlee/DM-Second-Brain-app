import fs from 'fs';
import path from 'path';
import { CampaignError } from './campaign-error';
import { INGEST_DIR, isSessionIngested, sessionFile } from './ingest-sessions';
import { Change, IngestState, readReal, readStaged, realFile, saveIngest } from './ingest-state';
import { WIKILINK } from './links';
import { writeFileAtomic } from './studio-steps';
import { getCampaignRoot } from './vault';

// The DM's review of the staged changes, and apply: the one place the ingest writes wiki/.

function inReview(s: IngestState) {
  if (s.phase !== 'review') throw new CampaignError(`${s.id} is not in review.`, 409);
}

function changeAt(s: IngestState, p: string): Change {
  const change = s.changes.find(c => c.path === p);
  if (!change) throw new CampaignError(`This ingest has no change to ${p}.`, 404);
  return change;
}

export function setReview(s: IngestState, p: string, review: 'approved' | 'rejected', note?: string): IngestState {
  inReview(s);
  const change = changeAt(s, p);
  change.review = review;
  if (note) change.note = note;
  else delete change.note;
  saveIngest(s);
  return s;
}

export function approveAll(s: IngestState): IngestState {
  inReview(s);
  for (const c of s.changes) if (c.review === 'pending' && !c.note) c.review = 'approved';
  saveIngest(s);
  return s;
}

// The page stays pending with the note; requestChanges sends the notes to the agent
export function askChanges(s: IngestState, p: string, note: string): IngestState {
  inReview(s);
  const change = changeAt(s, p);
  change.review = 'pending';
  change.note = note;
  saveIngest(s);
  return s;
}

const slugOf = (p: string) => path.basename(p, '.md');

// Approved pages linking (in frontmatter fields or text) to a new page the DM rejected
export function linkWarnings(s: IngestState): { from: string; to: string }[] {
  const rejected = new Map(s.changes.filter(c => c.kind === 'new' && c.review === 'rejected').map(c => [slugOf(c.path), c.path]));
  if (rejected.size === 0) return [];
  const warnings: { from: string; to: string }[] = [];
  for (const c of s.changes) {
    if (c.review !== 'approved') continue;
    const targets = new Set([...(readStaged(s, c.path) ?? '').matchAll(WIKILINK)].map(m => m[1].trim().toLowerCase().replace(/\s+/g, '-')));
    for (const t of targets) if (rejected.has(t)) warnings.push({ from: c.path, to: rejected.get(t)! });
  }
  return warnings;
}

const mtimeOf = (p: string) => (fs.existsSync(realFile(p)) ? fs.statSync(realFile(p)).mtimeMs : null);

// Approved changes whose real file changed since the agent first read it (or that it
// never read), and new pages or move targets that now exist: applying would overwrite the DM's work
export function conflicts(s: IngestState): string[] {
  return s.changes
    .filter(c => c.review === 'approved')
    .filter(c => {
      if (c.kind === 'new') return mtimeOf(c.path) !== null;
      if (c.kind === 'moved') return mtimeOf(c.path) !== null || mtimeOf(c.from!) !== s.reads[c.from!];
      return mtimeOf(c.path) !== s.reads[c.path];
    })
    .map(c => c.path);
}

// keepTheirs: conflicting changes dropped, the wiki's version kept. takeAgent: conflicting
// changes applied anyway. Any other conflict refuses the whole apply.
export function applyIngest(
  s: IngestState,
  keepTheirs: string[] = [],
  takeAgent: string[] = [],
): { written: string[]; moved: { from: string; to: string }[] } {
  inReview(s);
  const unresolved = conflicts(s).filter(p => !keepTheirs.includes(p) && !takeAgent.includes(p));
  if (unresolved.length) {
    throw new CampaignError(`These pages changed in the wiki during the ingest (conflict): ${unresolved.join(', ')}.`, 409);
  }
  for (const c of s.changes) if (keepTheirs.includes(c.path)) c.review = 'rejected';

  const written: string[] = [];
  const moved: { from: string; to: string }[] = [];
  for (const c of s.changes.filter(c => c.review === 'approved')) {
    const content = readStaged(s, c.path);
    if (content === null) continue;
    writeFileAtomic(realFile(c.path), content);
    if (c.kind === 'moved') {
      fs.rmSync(realFile(c.from!), { force: true });
      moved.push({ from: c.from!, to: c.path });
    } else {
      written.push(c.path);
    }
  }

  // The session must read as ingested even if the DM rejected the agent's log entry
  if (!isSessionIngested(s.id)) {
    const log = readReal('log.md') ?? '# Log\n';
    writeFileAtomic(
      realFile('log.md'),
      `${log.replace(/\n*$/, '\n\n')}## [unknown date | ${s.id}] ingest — applied from the app (${sessionFile(s.id)})\n`,
    );
  }

  fs.rmSync(path.join(getCampaignRoot(), INGEST_DIR, s.id, 'staged'), { recursive: true, force: true });
  s.phase = 'applied';
  saveIngest(s);
  return { written, moved };
}
