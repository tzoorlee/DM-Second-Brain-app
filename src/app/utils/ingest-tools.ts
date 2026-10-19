import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type Anthropic from '@anthropic-ai/sdk';
import { sessionFile } from './ingest-sessions';
import { Change, IngestPhase, IngestState, isWikiPath, readStaged, readWikiPage, stageMove, stagePage } from './ingest-state';
import { searchEntities } from './search';
import { isDmSecretsHeading } from './secrets';
import { getCampaignRoot } from './vault';
import { listWikiFiles } from './wiki';

// The tools the ingest agent works with. Reads see the staged pages over the real
// wiki; writes only ever reach staging, after the checks below.

type Tool = Anthropic.Beta.Messages.BetaTool;

const tool = (name: string, description: string, props: Record<string, string>): Tool => ({
  name,
  description,
  strict: true,
  input_schema: {
    type: 'object',
    properties: Object.fromEntries(Object.entries(props).map(([k, d]) => [k, { type: 'string', description: d }])),
    required: Object.keys(props),
    additionalProperties: false,
  },
});

const WIKI_PATH = 'Relative to wiki/, lowercase slugs, e.g. "characters/npcs/hilda.md".';

export const INGEST_TOOLS: { read: Tool[]; write: Tool[] } = {
  read: [
    tool('read_source', 'Read a source file: "session" (the recap being ingested), "world-bible", "house-rules", or "srd/<path>" (a file or folder under raw/srd/).', {
      file: '"session", "world-bible", "house-rules" or "srd/<path>".',
    }),
    tool('list_pages', 'List the wiki pages under a folder, staged ones included.', { folder: 'Folder relative to wiki/, e.g. "characters/npcs"; "" for all.' }),
    tool('search_wiki', 'Full-text search over the wiki (DM view, secrets included) and the pages staged in this ingest.', { query: 'Words to look for.' }),
    tool('read_page', 'Read a wiki page: your staged version if you wrote one, else the current page.', { path: WIKI_PATH }),
  ],
  write: [
    tool('write_page', 'Create or rewrite a whole wiki page (frontmatter included). It is staged for the DM to review, not written to the wiki.', {
      path: WIKI_PATH,
      content: 'The complete page.',
    }),
    tool('move_page', 'Move a page, e.g. a quest from quests/active/ to quests/completed/. Staged for review.', { from: WIKI_PATH, to: WIKI_PATH }),
    tool('append_log', 'Append one entry to wiki/log.md (staged).', { line: 'The entry, starting with "## [".' }),
    tool('finish', 'Call once every change is staged. The DM then reviews them.', { summary: 'What you changed and why, for the DM, in a few lines.' }),
  ],
};

// Both phases get the same list: the API binds thinking blocks to the tools they were made
// with, so a list that changed at Proceed would break the conversation. runTool refuses
// writes during the discussion instead.
export function toolsFor(phase: IngestPhase): Tool[] {
  return phase === 'discuss' || phase === 'working' ? [...INGEST_TOOLS.read, ...INGEST_TOOLS.write] : [];
}

const isWrite = (name: string) => INGEST_TOOLS.write.some(t => t.name === name);

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  staged?: Change;
  finished?: string;
}

const error = (content: string): ToolOutcome => ({ content, isError: true });

const SOURCES: Record<string, string> = { 'world-bible': 'raw/world-bible.md', 'house-rules': 'raw/house-rules.md' };

function readSource(s: IngestState, file: string): ToolOutcome {
  const root = getCampaignRoot();
  if (file === 'session') return { content: fs.readFileSync(path.join(root, sessionFile(s.id)), 'utf-8') };
  if (SOURCES[file]) {
    const abs = path.join(root, SOURCES[file]);
    return { content: fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : `(there is no ${SOURCES[file]})` };
  }
  const rel = /^srd(\/[^/\\]+)*$/.exec(file) && file.slice(4);
  if (rel === null || rel.split('/').some(p => p === '..' || p === '.')) return error(`Unknown source "${file}".`);
  const abs = path.join(root, 'raw', 'srd', ...rel.split('/').filter(Boolean));
  if (!fs.existsSync(abs)) return error(`There is no raw/srd/${rel}.`);
  if (fs.statSync(abs).isDirectory()) {
    const entries = fs.readdirSync(abs, { withFileTypes: true }).map(e => `${rel ? rel + '/' : ''}${e.name}${e.isDirectory() ? '/' : ''}`);
    return { content: entries.sort().join('\n') || '(empty folder)' };
  }
  return { content: fs.readFileSync(abs, 'utf-8') };
}

const isMovedAway = (s: IngestState, p: string) => s.changes.some(c => c.kind === 'moved' && c.from === p);

function listPages(s: IngestState, folder: string): ToolOutcome {
  const prefix = folder.replace(/\/+$/, '');
  const under = (p: string) => !prefix || p.startsWith(prefix + '/');
  const staged = new Set(s.changes.map(c => c.path));
  const real = listWikiFiles()
    .map(f => f.relativePath.split(path.sep).join('/'))
    .filter(p => !path.basename(p).startsWith('_') && !isMovedAway(s, p));
  const all = [...new Set([...real, ...staged])].filter(under).sort();
  return { content: all.map(p => (staged.has(p) ? `${p} (staged)` : p)).join('\n') || `(no pages under ${folder || 'wiki/'})` };
}

function searchWiki(s: IngestState, query: string): ToolOutcome {
  const lines = searchEntities(query, 'dm')
    .filter(h => !isMovedAway(s, h.relativePath) && !s.changes.some(c => c.path === h.relativePath))
    .slice(0, 10)
    .map(h => `${h.relativePath} — ${h.title}`);
  const needle = query.toLowerCase();
  for (const c of s.changes) {
    if (readStaged(s, c.path)?.toLowerCase().includes(needle)) lines.push(`${c.path} (staged)`);
  }
  return { content: lines.join('\n') || 'No matches.' };
}

// Problems that would make a page wrong in the wiki, reported so the agent fixes them
function pageProblem(p: string, content: string): string | null {
  if (!isWikiPath(p)) return `"${p}" is not a wiki path: use lowercase slugs relative to wiki/, like characters/npcs/hilda.md.`;
  if (p !== 'index.md' && p !== 'log.md') {
    let data: Record<string, unknown>;
    try {
      data = matter(content).data;
    } catch (e) {
      return `The frontmatter is not valid YAML: ${e instanceof Error ? e.message.split('\n')[0] : e}`;
    }
    if (!data.type) return 'The page needs YAML frontmatter with a "type" field (see TEMPLATES.md).';
  }
  // Only that exact level-2 heading is hidden from players: anything else that looks like
  // DM-only text (another level, bold, "Secrets" alone, a translation) would be shown
  const looksDmOnly = (l: string) => isDmSecretsHeading(l) || /^\s*(#{1,6}\s+|\*\*)\s*(secrets?\b|.*\b(DM|GM)\b)/i.test(l);
  const wrong = content.split(/\r?\n/).find(l => looksDmOnly(l) && l.trim() !== '## Secrets (DM only)');
  if (wrong) return `"${wrong.trim()}" marks DM-only text: the heading must be exactly "## Secrets (DM only)", or the app can't hide it from players.`;
  return null;
}

export function runTool(s: IngestState, name: string, input: Record<string, string>): ToolOutcome {
  if (!toolsFor(s.phase).some(t => t.name === name)) return error(`Unknown tool ${name}.`);
  if (s.phase === 'discuss' && isWrite(name)) {
    return error(`${name} is refused during the discussion: nothing is written until the DM presses Proceed. Wait for it.`);
  }
  try {
    switch (name) {
      case 'read_source':
        return readSource(s, input.file);
      case 'list_pages':
        return listPages(s, input.folder);
      case 'search_wiki':
        return searchWiki(s, input.query);
      case 'read_page': {
        const text = readWikiPage(s, input.path);
        return text === null ? error(`There is no page at ${input.path}.`) : { content: text };
      }
      case 'write_page': {
        const problem = pageProblem(input.path, input.content);
        if (problem) return error(problem);
        return { content: `Staged ${input.path}.`, staged: stagePage(s, input.path, input.content) };
      }
      case 'move_page':
        return { content: `Staged the move ${input.from} → ${input.to}.`, staged: stageMove(s, input.from, input.to) };
      case 'append_log': {
        if (!input.line.startsWith('## [')) return error('A log entry starts with "## [", e.g. "## [2026-02-01 | session-03] ingest — …".');
        // Read like a page, so apply sees a hand edit of the real log as a conflict
        const log = readWikiPage(s, 'log.md') ?? '# Log\n';
        return { content: 'Added to the staged log.', staged: stagePage(s, 'log.md', `${log.replace(/\n*$/, '\n\n')}${input.line.trim()}\n`) };
      }
      case 'finish':
        return { content: 'Handed to the DM for review.', finished: input.summary };
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e));
  }
  return error(`Unknown tool ${name}.`);
}
