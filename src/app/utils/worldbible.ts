// Section-level editing of raw/world-bible.md. The `## ` headings and the bold labels
// of `## Campaign` and `## Setting` are a contract with the template (English, never
// translated); everything else in the file belongs to the DM and is kept byte for byte.

export const WORLD_BIBLE_HEADINGS = [
  'Campaign',
  'Setting',
  'Tone and Atmosphere',
  'Lore Pillars (immutable truths)',
  'Naming Conventions',
  'Basic Geography',
  'Cosmology',
  'Things that do NOT exist in this world',
  'Style notes for the agent',
] as const;

export const CAMPAIGN_LABELS = ['Name', 'Output language', 'Starting level', 'Rules edition', 'Start date in the world'] as const;
export const SETTING_LABELS = ['World', 'Sources', 'Deviations from the published canon'] as const;

const DEVIATIONS = 'Deviations from the published canon';

interface Section {
  heading: string;
  // From the line after `## heading` up to (not including) the next `## ` line
  body: string;
}

interface Parsed {
  preamble: string;
  sections: Section[];
}

function parse(text: string): Parsed {
  const parts = text.split(/^(?=## )/m);
  const preamble = parts[0].startsWith('## ') ? '' : parts.shift()!;
  const sections = parts.map(part => {
    const newline = part.indexOf('\n');
    const header = newline === -1 ? part : part.slice(0, newline);
    return { heading: header.slice(3).trim(), body: newline === -1 ? '' : part.slice(newline + 1) };
  });
  return { preamble, sections };
}

const render = ({ preamble, sections }: Parsed) =>
  preamble + sections.map(s => `## ${s.heading}\n${s.body}`).join('');

// Work on LF text and give the file back with its own line endings
function withLf(text: string, edit: (lf: string) => string): string {
  const crlf = text.includes('\r\n');
  const out = edit(crlf ? text.replace(/\r\n/g, '\n') : text);
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

const lf = (text: string) => text.replace(/\r\n/g, '\n');

export function getSections(markdown: string, headings: string[]): Record<string, string> {
  const { sections } = parse(lf(markdown));
  return Object.fromEntries(headings.map(h => [h, sections.find(s => s.heading === h)?.body ?? '']));
}

export function replaceSections(markdown: string, bodies: Record<string, string>): string {
  return withLf(markdown, text => {
    const doc = parse(text);
    for (const [heading, raw] of Object.entries(bodies)) {
      const body = lf(raw).endsWith('\n') ? lf(raw) : lf(raw) + '\n';
      const existing = doc.sections.find(s => s.heading === heading);
      if (existing) {
        existing.body = body;
        continue;
      }
      // Missing: insert before the next contract heading present, or at the end
      const order = WORLD_BIBLE_HEADINGS as readonly string[];
      const later = order.slice(order.indexOf(heading) + 1);
      const at = order.includes(heading) ? doc.sections.findIndex(s => later.includes(s.heading)) : -1;
      const section = { heading, body };
      if (at === -1) {
        const last = doc.sections[doc.sections.length - 1];
        if (last && !last.body.endsWith('\n\n')) last.body += last.body.endsWith('\n') ? '\n' : '\n\n';
        doc.sections.push(section);
      } else {
        if (!body.endsWith('\n\n')) section.body = body + '\n';
        doc.sections.splice(at, 0, section);
      }
    }
    return render(doc);
  });
}

const fieldLine = (label: string) => new RegExp(`^- \\*\\*${label.replace(/[()]/g, '\\$&')}\\*\\*:[ \\t]?(.*)$`);

export function getField(markdown: string, heading: 'Campaign' | 'Setting', label: string): string | null {
  const body = getSections(markdown, [heading])[heading];
  for (const line of body.split('\n')) {
    const m = line.match(fieldLine(label));
    if (m) return m[1].trim();
  }
  return null;
}

// Edits the lines of one section; keeps the section's trailing blank lines
function editSectionLines(markdown: string, heading: string, edit: (lines: string[]) => string[]): string {
  const body = getSections(markdown, [heading])[heading];
  const trailing = body.match(/\n*$/)![0];
  const lines = body.slice(0, body.length - trailing.length).split('\n').filter((l, i, all) => !(all.length === 1 && l === ''));
  return replaceSections(markdown, { [heading]: edit(lines).join('\n') + (trailing || '\n') });
}

export function setField(markdown: string, heading: 'Campaign' | 'Setting', label: string, value: string): string {
  return editSectionLines(markdown, heading, lines => {
    const i = lines.findIndex(l => fieldLine(label).test(l));
    const line = `- **${label}**: ${value}`;
    if (i === -1) return [...lines, line];
    const next = [...lines];
    next[i] = line;
    return next;
  });
}

export function addDeviation(markdown: string, text: string): string {
  const withLabel = getField(markdown, 'Setting', DEVIATIONS) === null ? setField(markdown, 'Setting', DEVIATIONS, '') : markdown;
  return editSectionLines(withLabel, 'Setting', lines => {
    const i = lines.findIndex(l => fieldLine(DEVIATIONS).test(l));
    lines[i] = `- **${DEVIATIONS}**:`;
    let end = i + 1;
    while (end < lines.length && lines[end].startsWith('  - ')) end++;
    // Drop placeholders such as "(none)" or "(one per line; ...)"
    const kept = lines.slice(i + 1, end).filter(l => !/^ {2}- \(.*\)$/.test(l));
    return [...lines.slice(0, i + 1), ...kept, `  - ${text}`, ...lines.slice(end)];
  });
}
