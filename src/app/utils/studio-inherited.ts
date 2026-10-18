import fs from 'fs';
import path from 'path';
import { getCampaignRoot } from './vault';
import { setField } from './worldbible';

// A campaign made from the world of another (part 4 of the World Studio). The marker
// tells the Studio to show the "Inherited world" step and where the old history is.
export const INHERITED_FILE = '.dm-second-brain/studio/inherited.json';

export interface Inherited {
  id: string;
  title: string;
}

export function inheritedFrom(): Inherited | null {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(getCampaignRoot(), INHERITED_FILE), 'utf-8'));
    return typeof data?.id === 'string' && typeof data?.title === 'string' ? { id: data.id, title: data.title } : null;
  } catch {
    return null;
  }
}

const copy = (from: string, to: string, filter: (src: string) => boolean = () => true) => {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true, force: true, filter });
};

const emptyStep = (n: number) => ({
  n, status: 'approved', draft: null, messages: [], proposals: [], inconsistencies: [],
  usage: { input: 0, output: 0, cacheRead: 0 },
});

// Copies the world of `source` into a campaign being built in `target` (not yet the
// open campaign). The source is only read. Sessions, interludes, its wiki and its
// Studio state stay behind; its wiki becomes reference history in raw/setting/.
export function copyWorld(target: string, source: { id: string; root: string; title: string }, name: string, copyHouseRules: boolean) {
  const from = (rel: string) => path.join(source.root, rel);
  const to = (rel: string) => path.join(target, rel);

  if (fs.existsSync(from('raw/world-bible.md'))) {
    const bible = fs.readFileSync(from('raw/world-bible.md'), 'utf-8');
    fs.writeFileSync(to('raw/world-bible.md'), setField(bible, 'Campaign', 'Name', name));
  }
  if (copyHouseRules) copy(from('raw/house-rules.md'), to('raw/house-rules.md'));
  copy(from('raw/srd'), to('raw/srd'));
  copy(from('raw/setting'), to('raw/setting'));
  copy(from('raw/worldbuilding'), to('raw/worldbuilding'));
  copy(from('wiki'), to(`raw/setting/from-${source.id}`), src => !path.basename(src).startsWith('_template-'));

  // The Studio: the inherited step first, the steps the copy already covers approved
  const studio = to('.dm-second-brain/studio');
  fs.mkdirSync(studio, { recursive: true });
  fs.writeFileSync(path.join(studio, 'inherited.json'), JSON.stringify({ id: source.id, title: source.title }, null, 2) + '\n');
  const srdFiles = fs.existsSync(from('raw/srd')) && fs.readdirSync(from('raw/srd')).some(f => f !== 'README.md');
  const approved = [2, 3, 4, ...(copyHouseRules && fs.existsSync(from('raw/house-rules.md')) ? [5] : []), ...(srdFiles ? [6] : [])];
  for (const n of approved) fs.writeFileSync(path.join(studio, `step-${n}.json`), JSON.stringify(emptyStep(n), null, 2) + '\n');
}

const MAX_CHARS = 3000;

// The inherited history the AI should know: the old index, and the old pages that
// mention the longest words of the message
export function inheritedContext(message: string): string {
  const inherited = inheritedFrom();
  if (!inherited) return '';
  const base = path.join(getCampaignRoot(), 'raw', 'setting', `from-${inherited.id}`);
  if (!fs.existsSync(base)) return '';
  const rel = (p: string) => `raw/setting/from-${inherited.id}/${path.relative(base, p).split(path.sep).join('/')}`;
  const parts: string[] = [];
  const index = path.join(base, 'index.md');
  if (fs.existsSync(index)) parts.push(`### ${rel(index)} (history of "${inherited.title}", unknown to the new players)\n${fs.readFileSync(index, 'utf-8').slice(0, MAX_CHARS)}`);

  const words = message.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 3).sort((a, b) => b.length - a.length).slice(0, 3);
  if (!words.length) return parts.join('\n\n');
  const pages = (fs.readdirSync(base, { recursive: true }) as string[])
    .map(f => path.join(base, String(f)))
    .filter(p => p.endsWith('.md') && p !== index && fs.statSync(p).isFile());
  let added = 0;
  for (const page of pages) {
    if (added >= 5) break;
    const text = fs.readFileSync(page, 'utf-8');
    if (!words.some(w => text.toLowerCase().includes(w))) continue;
    parts.push(`### ${rel(page)}\n${text.slice(0, MAX_CHARS)}`);
    added++;
  }
  return parts.join('\n\n');
}
