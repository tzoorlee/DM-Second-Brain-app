import fs from 'fs';
import path from 'path';
import { getCampaignRoot } from './vault';
import { getField, getSections, replaceSections } from './worldbible';

export type StepKind = 'worldbible' | 'file' | 'worldbuilding' | 'srd' | 'summary';

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

export function getStep(n: number): StudioStep {
  const step = STUDIO_STEPS.find(s => s.n === n);
  if (!step) throw new Error(`There is no step ${n}.`);
  return step;
}

// The only files the Studio may write, relative to the campaign root
const ALLOWED = [
  /^raw\/world-bible\.md$/,
  /^raw\/house-rules\.md$/,
  /^raw\/worldbuilding\/[a-z0-9-]+\.md$/,
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
  if (step.kind === 'worldbuilding') {
    return joinSections(
      WORLDBUILDING_TOPICS.map(topic => [topic, readRel(topicFile(topic)).replace(new RegExp(`^# ${topic}\\n\\n?`), '')]),
    );
  }
  return '';
}

const isPlaceholder = (value: string | null) => !value || value.startsWith('(');

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
    const bible = replaceSections(current, sections);
    writeFileAtomic(resolveInCampaign(WORLD_BIBLE), bible);
    const written = [WORLD_BIBLE];
    if (n === 1 && updateClaudeConfig(bible)) written.push('CLAUDE.md');
    return written;
  }
  if (step.kind === 'file') {
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
