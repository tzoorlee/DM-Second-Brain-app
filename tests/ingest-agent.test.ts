import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { IngestEvent, ingestSystem, requestChanges, runIngestTurn, startIngest } from '../src/app/utils/ingest-agent';
import { loadIngest, readStaged, saveIngest } from '../src/app/utils/ingest-state';
import { IssueInput, StudioModel, TurnParams } from '../src/app/utils/studio-ai';
import { isolateEnv, makeCampaign, makeTempDir, writePage } from './helpers';

type Block = Anthropic.Beta.Messages.BetaContentBlock;
type Reply = () => Anthropic.Beta.Messages.BetaMessage;

const message = (content: Block[], stop: Anthropic.Beta.Messages.BetaStopReason = 'end_turn') =>
  ({
    id: 'msg', type: 'message', role: 'assistant', model: 'fake', content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
  }) as unknown as Anthropic.Beta.Messages.BetaMessage;
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Block;
let ids = 0;
const call = (name: string, input: unknown): Block => ({ type: 'tool_use', id: `tu${++ids}`, name, input }) as unknown as Block;
const say = (t: string): Reply => () => message([text(t)]);
const use = (...blocks: Block[]): Reply => () => message(blocks, 'tool_use');

class FakeModel implements StudioModel {
  name = 'fake';
  calls: TurnParams[] = [];
  constructor(private replies: Reply[], private forever?: Reply) {}
  async streamTurn(params: TurnParams, onText: (t: string) => void) {
    this.calls.push(structuredClone(params));
    const reply = this.replies.shift() ?? this.forever;
    if (!reply) throw new Error('no scripted reply');
    const m = reply();
    for (const b of m.content) if (b.type === 'text') onText(b.text);
    return m;
  }
  async checkCoherence(): Promise<IssueInput[]> {
    return [];
  }
  async available() {
    return true;
  }
}

let root: string;
const ID = 'session-01';
const PAGE = '---\ntype: npc\nname: "Brother Varn"\n---\n\n# Brother Varn\nA cultist of the Order.\n';

const collect = () => {
  const events: IngestEvent[] = [];
  return { events, emit: (e: IngestEvent) => events.push(e) };
};
const toolNames = (p: TurnParams) => p.tools.map(t => t.name);
const lastUserText = (p: TurnParams) => JSON.stringify(p.messages[p.messages.length - 1].content);

describe('Ingest agent', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    process.env.VAULT_PATH = root;
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Campaign rules\nINGEST workflow here.\n');
    fs.writeFileSync(path.join(root, 'TEMPLATES.md'), '# Templates\nnpc: type, name\n');
    fs.mkdirSync(path.join(root, 'raw', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'sessions', `${ID}.md`), '# Session 1\nThe party meets Brother Varn.\n');
    writePage(root, 'npcs/hilda.md', { type: 'npc', name: 'Hilda' }, '# Hilda');
  });

  it('builds the system prompt from the preamble, CLAUDE.md and TEMPLATES.md', async () => {
    const system = await ingestSystem(async () => 'unused');
    const all = system.map(b => b.text).join('\n');
    expect(all).toContain('companion app');
    expect(all).toContain('INGEST workflow here.');
    expect(all).toContain('npc: type, name');
    expect(system[system.length - 1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('downloads TEMPLATES.md when the campaign lacks it, and caches it', async () => {
    fs.rmSync(path.join(root, 'TEMPLATES.md'));
    let fetched = 0;
    const fetcher = async () => {
      fetched++;
      return '# Templates from GitHub\n';
    };
    expect((await ingestSystem(fetcher)).map(b => b.text).join()).toContain('Templates from GitHub');
    expect(fs.readFileSync(path.join(root, '.dm-second-brain', 'TEMPLATES.md'), 'utf-8')).toContain('from GitHub');
    await ingestSystem(fetcher);
    expect(fetched).toBe(1);
    // offline and no cache: the prompt says so instead of failing
    fs.rmSync(path.join(root, '.dm-second-brain', 'TEMPLATES.md'));
    const offline = await ingestSystem(async () => { throw new Error('offline'); });
    expect(offline.map(b => b.text).join()).toMatch(/TEMPLATES\.md could not be loaded/);
  });

  it('discusses first (writes refused), then works, stages and finishes', async () => {
    const model = new FakeModel([
      use(call('read_source', { file: 'session' })),
      say('Brother Varn appeared. Is he new?'),
      say('Thanks, noted.'),
      use(call('write_page', { path: 'npcs/brother-varn.md', content: PAGE })),
      use(call('append_log', { line: `## [2026-01-01 | ${ID}] ingest — meeting Varn` }), call('finish', { summary: 'Added Brother Varn.' })),
    ]);
    const a = collect();
    await startIngest(ID, model, a.emit);
    // the same tools in every phase: the API rejects thinking blocks made under another tool list
    expect(toolNames(model.calls[0])).toEqual(['read_source', 'list_pages', 'search_wiki', 'read_page', 'write_page', 'move_page', 'append_log', 'finish']);
    expect(model.calls[0].contextEditing).toBe(true);
    expect(lastUserText(model.calls[0])).toContain(`Ingest raw/sessions/${ID}.md`);
    expect(a.events).toContainEqual({ type: 'text', text: 'Brother Varn appeared. Is he new?' });
    expect(a.events[a.events.length - 1].type).toBe('done');
    expect(loadIngest(ID)?.phase).toBe('discuss');

    const b = collect();
    await runIngestTurn(ID, { message: 'Yes, he is new.' }, model, b.emit);
    expect(toolNames(model.calls[2])).toEqual(toolNames(model.calls[0]));
    expect(loadIngest(ID)?.phase).toBe('discuss');

    const c = collect();
    await runIngestTurn(ID, { proceed: true }, model, c.emit);
    expect(lastUserText(model.calls[3])).toContain('Proceed');
    expect(toolNames(model.calls[3])).toEqual(toolNames(model.calls[0]));
    expect(c.events).toContainEqual({ type: 'phase', phase: 'working' });
    expect(c.events).toContainEqual({ type: 'staged', change: { path: 'npcs/brother-varn.md', kind: 'new', review: 'pending' } });
    expect(c.events).toContainEqual({ type: 'phase', phase: 'review' });
    const s = loadIngest(ID)!;
    expect(s).toMatchObject({ phase: 'review', summary: 'Added Brother Varn.' });
    expect(s.changes.map(ch => ch.path)).toEqual(['npcs/brother-varn.md', 'log.md']);
    expect(s.usage).toEqual({ input: 50, output: 25, cacheRead: 10, cacheWrite: 5 });
    expect(model.calls).toHaveLength(5);
  });

  it('treats a chat "proceed" as Proceed', async () => {
    const model = new FakeModel([say('Takeaways.'), say('Working on it.')]);
    await startIngest(ID, model, () => {});
    await runIngestTurn(ID, { message: 'Proceed' }, model, () => {});
    expect(loadIngest(ID)?.phase).toBe('working');
    expect(toolNames(model.calls[1])).toContain('write_page');
  });

  it('stops after 40 rounds, keeping the work, and continues', async () => {
    const model = new FakeModel([say('Takeaways.'), use(call('write_page', { path: 'npcs/brother-varn.md', content: PAGE }))], use(call('list_pages', { folder: '' })));
    await startIngest(ID, model, () => {});
    const e = collect();
    await runIngestTurn(ID, { proceed: true }, model, e.emit);
    expect(model.calls).toHaveLength(41);
    expect(e.events.find(x => x.type === 'error')).toBeTruthy();
    const s = loadIngest(ID)!;
    expect(s.phase).toBe('working');
    expect(s.changes).toHaveLength(1);
    // the history ends with the tool results, so Continue can pick up
    expect(s.messages[s.messages.length - 1].role).toBe('user');
    const more = new FakeModel([use(call('finish', { summary: 'Done.' }))]);
    await runIngestTurn(ID, { continue: true }, more, () => {});
    expect(lastUserText(more.calls[0])).toContain('Continue where you left off');
    expect(loadIngest(ID)?.phase).toBe('review');
  });

  it('a refusal or a failure keeps the state before the reply', async () => {
    const model = new FakeModel([say('Takeaways.'), () => message([text('no')], 'refusal')]);
    await startIngest(ID, model, () => {});
    const before = loadIngest(ID)!;
    const e = collect();
    await runIngestTurn(ID, { message: 'Tell me more' }, model, e.emit);
    expect(e.events.some(x => x.type === 'error')).toBe(true);
    const after = loadIngest(ID)!;
    expect(after.phase).toBe('discuss');
    // the DM's message stays, the refused reply does not
    expect(after.messages).toHaveLength(before.messages.length + 1);
    const broken = new FakeModel([]);
    const f = collect();
    await runIngestTurn(ID, { message: 'again' }, broken, f.emit);
    expect(f.events).toContainEqual({ type: 'error', message: 'no scripted reply' });
  });

  it('refuses to start out of order and to chat when closed', async () => {
    fs.writeFileSync(path.join(root, 'raw', 'sessions', 'session-02.md'), '# 2\n');
    const e = collect();
    await startIngest('session-02', new FakeModel([]), e.emit);
    expect(e.events).toEqual([{ type: 'error', message: 'ingest session-01 first' }]);
    const f = collect();
    await runIngestTurn(ID, { message: 'hi' }, new FakeModel([]), f.emit);
    expect(f.events[0].type).toBe('error');
  });

  it('sends the requested changes back and only those pages', async () => {
    const model = new FakeModel([
      say('Takeaways.'),
      use(
        call('write_page', { path: 'npcs/brother-varn.md', content: PAGE }),
        call('write_page', { path: 'npcs/hilda.md', content: '---\ntype: npc\n---\n# Hilda\nScarred.\n' }),
        call('finish', { summary: 'v1' }),
      ),
      use(call('write_page', { path: 'npcs/brother-varn.md', content: PAGE.replace('cultist', 'high priest') }), call('finish', { summary: 'v2' })),
    ]);
    await startIngest(ID, model, () => {});
    await runIngestTurn(ID, { proceed: true }, model, () => {});
    const s = loadIngest(ID)!;
    s.changes[0].note = 'He is the high priest, not a cultist.';
    s.changes[1].review = 'approved';
    saveIngest(s);
    const e = collect();
    await requestChanges(ID, model, e.emit);
    const content = model.calls[2].messages[model.calls[2].messages.length - 1].content as { type: string; text?: string }[];
    const sent = content[content.length - 1].text!;
    expect(sent).toContain('npcs/brother-varn.md');
    expect(sent).toContain('high priest, not a cultist');
    expect(sent).not.toContain('npcs/hilda.md');
    const after = loadIngest(ID)!;
    expect(after.phase).toBe('review');
    expect(after.summary).toBe('v2');
    expect(after.changes[0]).toEqual({ path: 'npcs/brother-varn.md', kind: 'new', review: 'pending' });
    expect(after.changes[1].review).toBe('approved');
    expect(readStaged(after, 'npcs/brother-varn.md')).toContain('high priest');
  });
});
