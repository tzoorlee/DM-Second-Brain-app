import fs from 'fs';
import path from 'path';
import { CampaignError } from './campaign-error';
import { inheritedFrom } from './studio-inherited';
import { getCampaignRoot } from './vault';
import { addDeviation, getField, getSections, replaceSections, setField } from './worldbible';

export type StepKind = 'worldbible' | 'file' | 'worldbuilding' | 'srd' | 'summary' | 'prepare' | 'interlude' | 'inherited';

export interface StudioStep {
  n: number;
  id: string;
  title: string;
  kind: StepKind;
  headings?: string[];
  file?: string;
}

export const WORLDBUILDING_TOPICS = ['Regions', 'Cities', 'Factions', 'NPCs', 'Deities', 'Lore'] as const;

export const STUDIO_STEPS: StudioStep[] = [
  { n: 1, id: 'basics', title: 'Basics', kind: 'worldbible', headings: ['Campaign', 'Setting'] },
  {
    n: 2, id: 'tone', title: 'Tone and pillars', kind: 'worldbible',
    headings: ['Tone and Atmosphere', 'Lore Pillars (immutable truths)', 'Things that do NOT exist in this world', 'Style notes for the agent'],
  },
  { n: 3, id: 'world', title: 'Geography and cosmology', kind: 'worldbible', headings: ['Basic Geography', 'Cosmology'] },
  { n: 4, id: 'names', title: 'Naming conventions', kind: 'worldbible', headings: ['Naming Conventions'] },
  { n: 5, id: 'rules', title: 'House rules', kind: 'file', file: 'raw/house-rules.md' },
  { n: 6, id: 'srd', title: 'Rules reference (SRD)', kind: 'srd' },
  { n: 7, id: 'worldbuilding', title: 'Worldbuilding', kind: 'worldbuilding' },
  { n: 8, id: 'start', title: 'Starting point', kind: 'file', file: 'raw/worldbuilding/starting-point.md' },
  { n: 9, id: 'summary', title: 'Summary', kind: 'summary' },
];

export const WORLD_BIBLE = 'raw/world-bible.md';

// Step 0, only in a campaign made from the world of another
export const INHERITED_STEP: StudioStep = {
  n: 0, id: 'inherited', title: 'Inherited world', kind: 'inherited', file: 'raw/worldbuilding/inherited-world.md',
};

export const studioSteps = (): StudioStep[] => (inheritedFrom() ? [INHERITED_STEP, ...STUDIO_STEPS] : STUDIO_STEPS);

// Preparations and interludes made after play starts. They are numbered from 101 and
// behave like whole-file steps; studio-items.ts creates them.
export interface StudioItem {
  n: number;
  kind: 'prepare' | 'interlude';
  title: string;
  file: string;
  dateInWorld?: string;
  afterSession?: string;
}

export const ITEMS_FILE = '.dm-second-brain/studio/items.json';

export function readItems(): StudioItem[] {
  try {
    const items = JSON.parse(fs.readFileSync(path.join(getCampaignRoot(), ITEMS_FILE), 'utf-8'));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function getStep(n: number): StudioStep {
  const step = STUDIO_STEPS.find(s => s.n === n);
  if (step) return step;
  if (n === 0 && inheritedFrom()) return INHERITED_STEP;
  const item = n > 100 ? readItems().find(i => i.n === n) : undefined;
  if (!item) throw new Error(`There is no step ${n}.`);
  return { n: item.n, id: item.kind, title: item.title, kind: item.kind, file: item.file };
}

// The agent's log names each source file it ingested (template 0.6.0)
export function isIngested(file: string): boolean {
  const log = path.join(getCampaignRoot(), 'wiki', 'log.md');
  return fs.existsSync(log) && fs.readFileSync(log, 'utf-8').includes(file);
}

// The only files the Studio may write, relative to the campaign root
const ALLOWED = [
  /^raw\/world-bible\.md$/,
  /^raw\/house-rules\.md$/,
  /^raw\/worldbuilding\/[a-z0-9-]+\.md$/,
  /^raw\/interludes\/[a-z0-9-]+\.md$/,
  /^raw\/srd(\/[^/\\]+)+$/,
  /^\.dm-second-brain\/studio\/[a-z0-9-]+\.json$/,
  /^CLAUDE\.md$/,
];

export function resolveInCampaign(rel: string): string {
  const parts = rel.split('/');
  if (path.isAbsolute(rel) || rel.includes('\\') || parts.some(p => p === '..' || p === '.' || p === '') || !ALLOWED.some(r => r.test(rel))) {
    throw new Error(`The Studio may not write "${rel}".`);
  }
  return path.join(getCampaignRoot(), ...parts);
}

export function writeFileAtomic(abs: string, text: string) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}-${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, abs);
}

const readRel = (rel: string) => {
  const abs = path.join(getCampaignRoot(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
};

export function campaignHasSessions(): boolean {
  const dir = path.join(getCampaignRoot(), 'raw', 'sessions');
  return fs.existsSync(dir) && fs.readdirSync(dir).some(f => /^session-.+\.md$/.test(f));
}

// `## Heading` blocks, separated by a blank line
function joinSections(blocks: [string, string][]): string {
  return blocks
    .map(([heading, body], i) => {
      const block = `## ${heading}\n${body}`;
      return i < blocks.length - 1 && !block.endsWith('\n\n') ? block + '\n' : block;
    })
    .join('');
}

const hasHeading = (draft: string, heading: string) => draft.split(/\r?\n/).some(l => l.trim() === `## ${heading}`);

const topicFile = (topic: string) => `raw/worldbuilding/${topic.toLowerCase()}.md`;

export function readStepContent(n: number): string {
  const step = getStep(n);
  if (step.kind === 'worldbible') {
    const sections = getSections(readRel(WORLD_BIBLE), step.headings!);
    return joinSections(step.headings!.map(h => [h, sections[h]]));
  }
  if (step.kind === 'file') return readRel(step.file!);
  if (step.kind === 'inherited') {
    return readRel(step.file!) || `# Inherited world\n\n## When\n- (when this campaign takes place, compared with "${inheritedFrom()?.title}")\n\n## What changed\n- (what is different now)\n`;
  }
  if (step.kind === 'prepare' || step.kind === 'interlude') {
    const existing = readRel(step.file!);
    if (existing) return existing;
    const item = readItems().find(i => i.n === n)!;
    const front = item.kind === 'interlude' ? `---\ndate_in_world: "${item.dateInWorld}"\nafter_session: ${item.afterSession}\n---\n\n` : '';
    return `${front}# ${item.title}\n\n`;
  }
  if (step.kind === 'worldbuilding') {
    return joinSections(
      WORLDBUILDING_TOPICS.map(topic => [topic, readRel(topicFile(topic)).replace(new RegExp(`^# ${topic}\\n\\n?`), '')]),
    );
  }
  return '';
}

const isPlaceholder = (value: string | null) => !value || value.startsWith('(');

// Step 1 owns ## Campaign and ## Setting, but step 6 writes "Rules edition" and
// "Keep as deviation" adds Deviations: a step-1 draft written before those must not undo them
function keepOtherStepsFields(before: string, after: string): string {
  let next = after;
  const edition = getField(before, 'Campaign', 'Rules edition');
  if (!isPlaceholder(edition)) next = setField(next, 'Campaign', 'Rules edition', edition!);
  const deviations = (text: string) => {
    const body = getSections(text, ['Setting']).Setting.split('\n');
    const at = body.findIndex(l => l.startsWith('- **Deviations from the published canon**'));
    const items: string[] = [];
    for (let i = at + 1; at !== -1 && i < body.length && body[i].startsWith('  - '); i++) items.push(body[i].slice(4));
    return items.filter(d => !/^\(.*\)$/.test(d));
  };
  const present = new Set(deviations(next));
  for (const d of deviations(before)) if (!present.has(d)) next = addDeviation(next, d);
  return next;
}

// CLAUDE.md's configuration block: "> - **Output language:** …" and "> - **Campaign name:** …"
function updateClaudeConfig(bible: string): boolean {
  const rel = 'CLAUDE.md';
  const text = readRel(rel);
  if (!text) return false;
  let next = text;
  const lines: [string, string | null][] = [
    ['Output language', getField(bible, 'Campaign', 'Output language')],
    ['Campaign name', getField(bible, 'Campaign', 'Name')],
  ];
  for (const [label, value] of lines) {
    if (isPlaceholder(value)) continue;
    next = next.replace(new RegExp(`^> - \\*\\*${label}:\\*\\*.*$`, 'm'), () => `> - **${label}:** ${value}`);
  }
  if (next === text) return false;
  writeFileAtomic(resolveInCampaign(rel), next);
  return true;
}

// Writes an approved draft. Returns the campaign-relative paths written.
export function writeStepContent(n: number, draft: string): string[] {
  const step = getStep(n);
  if (step.kind === 'worldbible') {
    const owned = step.headings!.filter(h => hasHeading(draft, h));
    const sections = getSections(draft, owned);
    const current = readRel(WORLD_BIBLE) || '# World Bible\n\n';
    let bible = replaceSections(current, sections);
    if (n === 1) bible = keepOtherStepsFields(current, bible);
    writeFileAtomic(resolveInCampaign(WORLD_BIBLE), bible);
    const written = [WORLD_BIBLE];
    if (n === 1 && updateClaudeConfig(bible)) written.push('CLAUDE.md');
    return written;
  }
  if (step.kind === 'file' || step.kind === 'prepare' || step.kind === 'interlude' || step.kind === 'inherited') {
    // Once the agent has ingested it, a new preparation or interlude is the way to add more
    if ((step.kind === 'prepare' || step.kind === 'interlude') && isIngested(step.file!)) {
      throw new CampaignError(`${step.file} was already ingested by the agent: start a new one to add more.`, 409);
    }
    writeFileAtomic(resolveInCampaign(step.file!), draft);
    return [step.file!];
  }
  if (step.kind === 'worldbuilding') {
    const sections = getSections(draft, [...WORLDBUILDING_TOPICS]);
    const written: string[] = [];
    for (const topic of WORLDBUILDING_TOPICS) {
      const body = sections[topic].trim();
      if (!body) continue;
      writeFileAtomic(resolveInCampaign(topicFile(topic)), `# ${topic}\n\n${body}\n`);
      written.push(topicFile(topic));
    }
    return written;
  }
  return [];
}
