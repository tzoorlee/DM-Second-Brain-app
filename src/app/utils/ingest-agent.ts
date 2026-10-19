import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { downloadCapped } from './download';
import { CONTINUE_MESSAGE, INGEST_PREAMBLE, PROCEED_MESSAGE, START_MESSAGE } from './ingest-prompts';
import { canStart, sourceFiles } from './ingest-sources';
import { Change, IngestPhase, IngestState, loadIngest, newIngest, resolveForIngest, saveIngest } from './ingest-state';
import { runTool, toolsFor } from './ingest-tools';
import { StudioModel } from './studio-ai';
import { writeFileAtomic } from './studio-steps';
import { getCampaignRoot, TEMPLATE_RELEASE, TEMPLATE_REPO } from './vault';

// The ingest agent: a Messages API loop over the app's own tools (ingest-tools.ts).
// It discusses the session, then stages every change; the DM reviews them in ingest-apply.ts.

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type TextBlockParam = Anthropic.Beta.Messages.BetaTextBlockParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export type IngestEvent =
  | { type: 'text'; text: string }
  | { type: 'staged'; change: Change }
  | { type: 'phase'; phase: IngestPhase }
  | { type: 'done'; usage: IngestState['usage'] }
  | { type: 'error'; message: string };

type Emit = (e: IngestEvent) => void;

// Model calls per exchange: a session touches 10–20 pages, each read and written
export const MAX_ROUNDS = 40;

const TEMPLATES_CACHE = '.dm-second-brain/TEMPLATES.md';

export async function fetchTemplatesMd(): Promise<string> {
  const url = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/${TEMPLATE_RELEASE}/TEMPLATES.md`;
  return (await downloadCapped(url, 1024 * 1024, 'TEMPLATES.md')).toString('utf-8');
}

// Campaigns made before template 0.5.0 have no TEMPLATES.md: the pinned release's is used
async function templatesMd(fetcher: () => Promise<string>): Promise<string> {
  const root = getCampaignRoot();
  for (const rel of ['TEMPLATES.md', TEMPLATES_CACHE]) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) return fs.readFileSync(abs, 'utf-8');
  }
  try {
    const text = await fetcher();
    writeFileAtomic(resolveForIngest(TEMPLATES_CACHE), text);
    return text;
  } catch {
    return '(TEMPLATES.md could not be loaded: follow the frontmatter of the existing pages of the same type.)';
  }
}

export async function ingestSystem(fetcher: () => Promise<string> = fetchTemplatesMd): Promise<TextBlockParam[]> {
  const claudeMd = path.join(getCampaignRoot(), 'CLAUDE.md');
  const rules = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf-8') : '(this campaign has no CLAUDE.md)';
  return [
    { type: 'text', text: INGEST_PREAMBLE },
    { type: 'text', text: `<campaign_claude_md>\n${rules}\n</campaign_claude_md>` },
    { type: 'text', text: `<templates_md>\n${await templatesMd(fetcher)}\n</templates_md>`, cache_control: { type: 'ephemeral' } },
  ];
}

// After a tool round the history ends with a user turn of tool results: text joins it
function addUserText(messages: MessageParam[], text: string) {
  const last = messages[messages.length - 1];
  if (last?.role === 'user') {
    const content = typeof last.content === 'string' ? [{ type: 'text' as const, text: last.content }] : [...last.content];
    messages[messages.length - 1] = { role: 'user', content: [...content, { type: 'text', text }] };
  } else {
    messages.push({ role: 'user', content: text });
  }
}

// Only an explicit word: "go" or "vai" can be an answer to the agent's question
const PROCEED_WORDS = /^(ok,? )?(proceed|procedi)[.!]?$/i;

// One exchange at a time per ingest: a second request while the agent works would fork the state
const running = new Set<string>();

// Discard waits for this: a running exchange would save its state over the discarded one
export const isRunning = (id: string) => running.has(id);

// Runs the model until it stops calling tools, finishes, or uses MAX_ROUNDS calls.
// Progress is saved after every tool round, so a failure keeps the staged work and
// the history up to the last complete round; the failed reply is dropped.
async function exchange(s: IngestState, model: StudioModel, emit: Emit): Promise<void> {
  const system = await ingestSystem();
  try {
    for (let round = 0; ; round++) {
      if (round === MAX_ROUNDS) {
        emit({ type: 'error', message: `The agent used ${MAX_ROUNDS} rounds without finishing. Its work so far is kept: Continue to let it go on.` });
        return;
      }
      const reply = await model.streamTurn({ system, messages: s.messages, tools: toolsFor(s.phase), contextEditing: true }, text =>
        emit({ type: 'text', text }),
      );
      s.usage.input += reply.usage.input_tokens;
      s.usage.output += reply.usage.output_tokens;
      s.usage.cacheRead += reply.usage.cache_read_input_tokens ?? 0;
      s.usage.cacheWrite = (s.usage.cacheWrite ?? 0) + (reply.usage.cache_creation_input_tokens ?? 0);
      s.rounds++;
      if (reply.stop_reason === 'refusal') {
        saveIngest(s);
        emit({ type: 'error', message: 'The model declined to continue. Rephrase your message, or discard the ingest.' });
        return;
      }
      // A cut-off answer could end in a tool call with no result: keep nothing of it
      if (reply.stop_reason !== 'end_turn' && reply.stop_reason !== 'tool_use' && reply.stop_reason !== 'stop_sequence') {
        saveIngest(s);
        emit({ type: 'error', message: `The answer was cut off (${reply.stop_reason}). Continue to retry.` });
        return;
      }
      s.messages.push({ role: 'assistant', content: reply.content as MessageParam['content'] });
      if (reply.stop_reason !== 'tool_use') {
        saveIngest(s);
        emit({ type: 'done', usage: s.usage });
        return;
      }

      const results: ToolResult[] = [];
      let finished: string | null = null;
      for (const block of reply.content) {
        if (block.type !== 'tool_use') continue;
        const out = runTool(s, block.name, block.input as Record<string, string>);
        if (out.staged) emit({ type: 'staged', change: out.staged });
        if (out.finished !== undefined) finished = out.finished;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: out.content, ...(out.isError ? { is_error: true } : {}) });
      }
      s.messages.push({ role: 'user', content: results });
      if (finished !== null) {
        s.summary = finished;
        s.phase = 'review';
        saveIngest(s);
        emit({ type: 'phase', phase: 'review' });
        emit({ type: 'done', usage: s.usage });
        return;
      }
      saveIngest(s);
    }
  } catch (error) {
    // Keep the usage and staged work; drop a tool call left without its results
    const last = s.messages[s.messages.length - 1];
    if (last?.role === 'assistant') s.messages.pop();
    try {
      saveIngest(s);
    } catch {}
    emit({ type: 'error', message: error instanceof Error ? error.message : 'The AI request failed.' });
  }
}

// The browser may go away mid-exchange (tab closed, reload): its stream then throws on
// every event. The agent finishes the round anyway, so history and staging stay in step.
const quiet = (emit: Emit): Emit => e => {
  try {
    emit(e);
  } catch {
    // nobody is listening
  }
};

async function withLock(id: string, rawEmit: Emit, run: (emit: Emit) => Promise<void>) {
  const emit = quiet(rawEmit);
  if (running.has(id)) {
    emit({ type: 'error', message: `The agent is already working on ${id}.` });
    return;
  }
  running.add(id);
  try {
    await run(emit);
  } finally {
    running.delete(id);
  }
}

export async function startIngest(id: string, model: StudioModel, emit: Emit): Promise<void> {
  const check = canStart(id);
  if (!check.ok) {
    emit({ type: 'error', message: check.reason });
    return;
  }
  await withLock(id, emit, async emit => {
    const s = newIngest(id);
    addUserText(s.messages, START_MESSAGE(sourceFiles(id)[0]));
    saveIngest(s);
    await exchange(s, model, emit);
  });
}

export async function runIngestTurn(
  id: string,
  input: { message?: string; proceed?: boolean; continue?: boolean },
  model: StudioModel,
  emit: Emit,
): Promise<void> {
  await withLock(id, emit, async emit => {
    const s = loadIngest(id);
    if (!s || (s.phase !== 'discuss' && s.phase !== 'working')) {
      emit({ type: 'error', message: s?.phase === 'review' ? 'The changes are in review: approve, reject or ask for changes.' : `${id} has no open ingest.` });
      return;
    }
    const message = input.message?.trim();
    if (input.proceed || (s.phase === 'discuss' && message && PROCEED_WORDS.test(message))) {
      if (s.phase === 'discuss') {
        s.phase = 'working';
        emit({ type: 'phase', phase: 'working' });
      }
      addUserText(s.messages, message && !PROCEED_WORDS.test(message) ? `${message}\n\n${PROCEED_MESSAGE}` : PROCEED_MESSAGE);
    } else if (message) {
      addUserText(s.messages, message);
    } else if (input.continue) {
      addUserText(s.messages, CONTINUE_MESSAGE);
    } else {
      emit({ type: 'error', message: 'Nothing to send.' });
      return;
    }
    saveIngest(s);
    await exchange(s, model, emit);
  });
}

// The DM's "Ask for changes" notes go back to the agent, which rewrites those pages only
export async function requestChanges(id: string, model: StudioModel, emit: Emit): Promise<void> {
  await withLock(id, emit, async emit => {
    const s = loadIngest(id);
    const asked = s?.changes.filter(c => c.note && c.review === 'pending') ?? [];
    if (!s || s.phase !== 'review' || asked.length === 0) {
      emit({ type: 'error', message: 'There are no requested changes to send.' });
      return;
    }
    s.phase = 'working';
    emit({ type: 'phase', phase: 'working' });
    const lines = asked.map(c => `- ${c.kind === 'moved' ? `${c.from} → ${c.path}` : c.path}: ${c.note}`);
    addUserText(
      s.messages,
      `The DM reviewed your changes and asks you to redo these pages:\n${lines.join('\n')}\n\nRewrite only these, leave every other staged page as it is, then call finish again.`,
    );
    saveIngest(s);
    await exchange(s, model, emit);
  });
}
