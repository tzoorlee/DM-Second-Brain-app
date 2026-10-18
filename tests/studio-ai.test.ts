import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  approveStep,
  buildContext,
  buildSystem,
  IssueInput,
  runChatTurn,
  StudioEvent,
  StudioModel,
  TurnParams,
} from '../src/app/utils/studio-ai';
import { loadStep } from '../src/app/utils/studio-state';
import { isolateEnv, makeCampaign, makeTempDir, writePage } from './helpers';

type Block = Anthropic.Beta.Messages.BetaContentBlock;

const message = (content: Block[], stop: Anthropic.Beta.Messages.BetaStopReason = 'end_turn') =>
  ({
    id: 'msg', type: 'message', role: 'assistant', model: 'fake', content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 0 },
  }) as unknown as Anthropic.Beta.Messages.BetaMessage;

const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as unknown as Block;

// Plays back one scripted reply per model call and records what it was sent
class FakeModel implements StudioModel {
  name = 'fake';
  calls: TurnParams[] = [];
  coherencePrompts: string[] = [];
  constructor(
    private replies: ((onText: (t: string) => void) => Anthropic.Beta.Messages.BetaMessage)[],
    private issues: IssueInput[] = [],
  ) {}
  async streamTurn(params: TurnParams, onText: (t: string) => void) {
    this.calls.push(structuredClone(params));
    const reply = this.replies.shift();
    if (!reply) throw new Error('no scripted reply');
    return reply(onText);
  }
  async checkCoherence(_system: string, prompt: string) {
    this.coherencePrompts.push(prompt);
    return this.issues;
  }
  async available() {
    return true;
  }
}

let root: string;
const BIBLE = '# World Bible\n\n## Campaign\n- **Name**: Test\n\n## Tone and Atmosphere\n- (tone)\n\n## Naming Conventions\n- (names)\n';

async function chat(n: number, msg: string, model: StudioModel) {
  const events: StudioEvent[] = [];
  await runChatTurn(n, msg, model, e => events.push(e));
  return events;
}

describe('Studio AI', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    fs.mkdirSync(path.join(root, 'raw'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'world-bible.md'), BIBLE);
    process.env.VAULT_PATH = root;
  });

  it('streams a text answer and saves the exchange', async () => {
    const model = new FakeModel([
      onText => {
        onText('Hello ');
        onText('DM');
        return message([text('Hello DM')]);
      },
    ]);
    const events = await chat(2, 'Make it grim', model);
    expect(events.filter(e => e.type === 'text').map(e => (e as { text: string }).text).join('')).toBe('Hello DM');
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    const state = loadStep(2);
    expect(state.status).toBe('in-progress');
    expect(state.messages[0]).toEqual({ role: 'user', content: 'Make it grim' });
    expect(state.messages[1].role).toBe('assistant');
    expect(state.usage).toEqual({ input: 10, output: 5, cacheRead: 2 });
  });

  it('sends the context and the draft with the new message only', async () => {
    const model = new FakeModel([() => message([text('ok')]), () => message([text('ok')])]);
    await chat(4, 'first', model);
    await chat(4, 'second', model);
    const last = model.calls[1].messages;
    expect(last[0]).toEqual({ role: 'user', content: 'first' });
    const blocks = last.at(-1)!.content as { type: string; text: string }[];
    expect(blocks.map(b => b.text).join('\n')).toContain('## Naming Conventions');
    expect(blocks.at(-1)!.text).toBe('second');
  });

  it('turns propose_edit for an owned section into a pending proposal', async () => {
    const model = new FakeModel([
      () => message([toolUse('t1', 'propose_edit', { section: 'Tone and Atmosphere', new_text: '- Grim.', reason: 'You asked' })], 'tool_use'),
      () => message([text('Done')]),
    ]);
    const events = await chat(2, 'Make it grim', model);
    expect(events.find(e => e.type === 'proposal')).toMatchObject({ proposal: { section: 'Tone and Atmosphere', newText: '- Grim.', status: 'pending' } });
    const results = model.calls[1].messages.at(-1)!.content as { type: string; tool_use_id: string; is_error?: boolean }[];
    expect(results[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(results[0].is_error).toBeFalsy();
    expect(loadStep(2).proposals).toHaveLength(1);
    expect(loadStep(2).draft).toBeNull();
  });

  it('refuses a proposal for a section the step does not own', async () => {
    const model = new FakeModel([
      () => message([toolUse('t1', 'propose_edit', { section: 'Cosmology', new_text: '- x', reason: 'r' })], 'tool_use'),
      () => message([text('Sorry')]),
    ]);
    const events = await chat(4, 'names', model);
    expect(events.some(e => e.type === 'proposal')).toBe(false);
    const results = model.calls[1].messages.at(-1)!.content as { is_error?: boolean; content: string }[];
    expect(results[0].is_error).toBe(true);
    expect(results[0].content).toContain('Naming Conventions');
  });

  it('records a reported inconsistency', async () => {
    const issue = { file: 'raw/world-bible.md', quote: 'low-magic', problem: 'Archmages everywhere', proposed_fix: 'Make it one archmage', severity: 'error' };
    const model = new FakeModel([() => message([toolUse('t1', 'report_inconsistency', issue)], 'tool_use'), () => message([text('Noted')])]);
    const events = await chat(7, 'A school of archmages', model);
    expect(events.find(e => e.type === 'inconsistency')).toMatchObject({ inconsistency: { problem: 'Archmages everywhere', status: 'open', severity: 'error' } });
    expect(loadStep(7).inconsistencies).toHaveLength(1);
  });

  it('a failure mid-stream reports an error and leaves the step as it was', async () => {
    const model = new FakeModel([
      onText => {
        onText('par');
        throw new Error('network down');
      },
    ]);
    const before = loadStep(2);
    const events = await chat(2, 'hello', model);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
    expect(loadStep(2)).toEqual(before);
  });

  it('a refusal is reported and nothing is saved', async () => {
    const model = new FakeModel([() => message([], 'refusal')]);
    const events = await chat(2, 'hello', model);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('declined') });
    expect(loadStep(2).messages).toEqual([]);
  });

  it('approval with open issues writes nothing; skipping the check writes', async () => {
    const issue: IssueInput = { file: 'raw/world-bible.md', quote: 'x', problem: 'p', proposed_fix: 'f', severity: 'error' };
    const model = new FakeModel([], [issue]);
    const draft = '## Naming Conventions\n- Hard consonants.\n';
    const first = await approveStep(4, draft, model, false);
    expect('issues' in first && first.issues).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, 'raw', 'world-bible.md'), 'utf-8')).toBe(BIBLE);
    expect(loadStep(4).inconsistencies).toHaveLength(1);
    const second = await approveStep(4, draft, model, true);
    expect(second).toEqual({ written: ['raw/world-bible.md'] });
    expect(loadStep(4).status).toBe('approved');
    expect(fs.readFileSync(path.join(root, 'raw', 'world-bible.md'), 'utf-8')).toContain('- Hard consonants.');
  });

  it('the approval check does not compare a step with the old text of its own sections', async () => {
    const model = new FakeModel([], []);
    await approveStep(4, '## Naming Conventions\n- Hard consonants.\n', model, false);
    const prompt = model.coherencePrompts[0];
    expect(prompt).toContain('- Hard consonants.');
    expect(prompt).not.toContain('- (names)');
    expect(prompt).toContain('- (tone)');
  });

  it('the approval check leaves out the file a whole-file step replaces', async () => {
    fs.writeFileSync(path.join(root, 'raw', 'house-rules.md'), '# House Rules\n- Old crit rule.\n');
    const model = new FakeModel([], []);
    await approveStep(5, '# House Rules\n- New crit rule.\n', model, false);
    expect(model.coherencePrompts[0]).not.toContain('Old crit rule');
    expect(model.coherencePrompts[0]).toContain('New crit rule');
  });

  it('approval without a model writes directly', async () => {
    expect(await approveStep(4, '## Naming Conventions\n- Soft.\n', null, false)).toEqual({ written: ['raw/world-bible.md'] });
  });

  it('adds wiki pages to the context once the campaign has a session', () => {
    writePage(root, 'characters/npcs/aldric.md', { type: 'npc', status: 'dead', pg_known: true }, '# Aldric Ironwood\n\nCaptain of the guard, killed in session 14.');
    fs.writeFileSync(path.join(root, 'wiki', 'index.md'), '# Index\n- [[aldric|Aldric Ironwood]]\n');
    expect(buildContext(7, 'Aldric')).not.toContain('Aldric Ironwood');
    fs.mkdirSync(path.join(root, 'raw', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'sessions', 'session-01.md'), '# Session 1');
    const context = buildContext(7, 'Aldric');
    expect(context).toContain('wiki/index.md');
    expect(context).toContain('killed in session 14');
  });

  it('caches the system prompt at its last block', () => {
    const system = buildSystem(2);
    expect(system.at(-1)).toMatchObject({ cache_control: { type: 'ephemeral' } });
    expect(system.slice(0, -1).every(b => !('cache_control' in b) || !b.cache_control)).toBe(true);
    expect(system.map(b => b.text).join('\n')).toContain('Tone and Atmosphere');
  });
});
