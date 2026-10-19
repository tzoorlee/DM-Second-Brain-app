import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as overview } from '../src/app/api/ingest/route';
import { GET as getIngest, PUT as putIngest } from '../src/app/api/ingest/[id]/route';
import { POST as start } from '../src/app/api/ingest/[id]/start/route';
import { POST as chat } from '../src/app/api/ingest/[id]/chat/route';
import { POST as changes } from '../src/app/api/ingest/[id]/changes/route';
import { POST as apply } from '../src/app/api/ingest/[id]/apply/route';
import { POST as discard } from '../src/app/api/ingest/[id]/discard/route';
import { GET as pageRoute } from '../src/app/api/ingest/[id]/page/route';
import { GET as recap } from '../src/app/api/ingest/[id]/recap/route';
import type { StudioModel } from '../src/app/utils/studio-ai';
import { setStudioModel } from '../src/app/utils/studio-model';
import { isolateEnv, makeCampaign, makeTempDir, writePage } from './helpers';

type Block = Anthropic.Beta.Messages.BetaContentBlock;
const ID = 'session-01';
const PAGE = '---\ntype: npc\nname: "Varn"\n---\n\n# Varn\n';

let root: string;
let available = true;
let replies: Block[][] = [];
const fake: StudioModel = {
  name: 'fake-model',
  async streamTurn(_params, onText) {
    const content = replies.shift() ?? [{ type: 'text', text: 'Takeaways.' } as unknown as Block];
    for (const b of content) if (b.type === 'text') onText(b.text);
    return {
      content, stop_reason: content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
    } as unknown as Anthropic.Beta.Messages.BetaMessage;
  },
  async checkCoherence() {
    return [];
  },
  async available() {
    return available;
  },
};
const toolUse = (name: string, input: unknown) => ({ type: 'tool_use', id: `t-${name}-${Math.random()}`, name, input }) as unknown as Block;

const json = (method: string, body?: unknown) =>
  new Request('http://localhost/x', { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const events = async (res: Response) => (await res.text()).trim().split('\n').map(l => JSON.parse(l));

describe('Ingest API', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    process.env.VAULT_PATH = root;
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules\n');
    fs.writeFileSync(path.join(root, 'TEMPLATES.md'), '# Templates\n');
    fs.mkdirSync(path.join(root, 'raw', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'sessions', `${ID}.md`), '# Session 1\n');
    fs.writeFileSync(path.join(root, 'raw', 'sessions', 'session-02.md'), '# Session 2\n');
    writePage(root, 'npcs/hilda.md', { type: 'npc', name: 'Hilda' }, '# Hilda');
    available = true;
    replies = [];
    setStudioModel(fake);
  });
  afterEach(() => setStudioModel(null));

  it('GET /api/ingest lists sessions and the AI', async () => {
    const body = await (await overview()).json();
    expect(body).toMatchObject({ aiAvailable: true, model: 'fake-model', open: null });
    expect(body.sessions.map((s: { id: string; status: string }) => `${s.id}:${s.status}`)).toEqual(['session-01:not-ingested', 'session-02:not-ingested']);
    expect(body.terminalCommand).toContain(`claude "ingest raw/sessions/${ID}.md"`);
  });

  it('runs a whole ingest: start, chat, proceed, review, apply', async () => {
    const started = await events(await start(json('POST'), ctx(ID)));
    expect(started[started.length - 1].type).toBe('done');
    expect((await (await overview()).json()).open).toBe(ID);

    replies = [[toolUse('write_page', { path: 'npcs/varn.md', content: PAGE })], [toolUse('finish', { summary: 'Varn.' })]];
    const worked = await events(await chat(json('POST', { proceed: true }), ctx(ID)));
    expect(worked).toContainEqual({ type: 'staged', change: { path: 'npcs/varn.md', kind: 'new', review: 'pending' } });

    const state = await (await getIngest(json('GET'), ctx(ID))).json();
    expect(state).toMatchObject({ phase: 'review', summary: 'Varn.', sourceChanged: false, linkWarnings: [], conflicts: [] });

    const diff = await (await pageRoute(new Request('http://localhost/x?path=npcs/varn.md'), ctx(ID))).json();
    expect(diff).toEqual({ before: null, after: PAGE });
    expect((await pageRoute(new Request('http://localhost/x?path=../x.md'), ctx(ID))).status).toBe(400);

    const approved = await (await putIngest(json('PUT', { approveAll: true }), ctx(ID))).json();
    expect(approved.changes[0].review).toBe('approved');
    const applied = await (await apply(json('POST', {}), ctx(ID))).json();
    expect(applied).toEqual({ written: ['npcs/varn.md'], moved: [] });
    expect(fs.existsSync(path.join(root, 'wiki', 'npcs', 'varn.md'))).toBe(true);
    expect((await (await overview()).json()).sessions[0].status).toBe('ingested');
  });

  it('asks for changes and sends them to the agent', async () => {
    await events(await start(json('POST'), ctx(ID)));
    replies = [[toolUse('write_page', { path: 'npcs/varn.md', content: PAGE }), toolUse('finish', { summary: 'v1' })]];
    await events(await chat(json('POST', { proceed: true }), ctx(ID)));
    const asked = await (await putIngest(json('PUT', { path: 'npcs/varn.md', note: 'Older.' }), ctx(ID))).json();
    expect(asked.changes[0]).toMatchObject({ review: 'pending', note: 'Older.' });
    replies = [[toolUse('write_page', { path: 'npcs/varn.md', content: PAGE + 'Old.\n' }), toolUse('finish', { summary: 'v2' })]];
    const redone = await events(await changes(json('POST'), ctx(ID)));
    expect(redone).toContainEqual({ type: 'phase', phase: 'review' });
    expect((await (await getIngest(json('GET'), ctx(ID))).json()).summary).toBe('v2');
    expect((await putIngest(json('PUT', { path: 'npcs/varn.md', review: 'maybe' }), ctx(ID))).status).toBe(400);
  });

  it('reports a recap edited after the start, and a conflict on apply', async () => {
    await events(await start(json('POST'), ctx(ID)));
    const recap = path.join(root, 'raw', 'sessions', `${ID}.md`);
    const later = new Date(Date.now() + 10_000);
    fs.utimesSync(recap, later, later);
    expect((await (await getIngest(json('GET'), ctx(ID))).json()).sourceChanged).toBe(true);

    replies = [[toolUse('read_page', { path: 'npcs/hilda.md' })], [toolUse('write_page', { path: 'npcs/hilda.md', content: PAGE }), toolUse('finish', { summary: 's' })]];
    await events(await chat(json('POST', { proceed: true }), ctx(ID)));
    await putIngest(json('PUT', { approveAll: true }), ctx(ID));
    const hilda = path.join(root, 'wiki', 'npcs', 'hilda.md');
    fs.writeFileSync(hilda, '# DM edit\n');
    fs.utimesSync(hilda, later, later);
    const res = await apply(json('POST', {}), ctx(ID));
    expect(res.status).toBe(409);
    expect((await res.json()).conflicts).toEqual(['npcs/hilda.md']);
    expect((await apply(json('POST', { keepTheirs: ['npcs/hilda.md'] }), ctx(ID))).status).toBe(200);
    expect(fs.readFileSync(hilda, 'utf-8')).toBe('# DM edit\n');
  });

  it('answers 503 without credentials, 409 out of order, and discards', async () => {
    available = false;
    expect((await start(json('POST'), ctx(ID))).status).toBe(503);
    available = true;
    expect((await start(json('POST'), ctx('session-02'))).status).toBe(409);
    await events(await start(json('POST'), ctx(ID)));
    expect((await start(json('POST'), ctx('session-02'))).status).toBe(409);
    expect(await (await discard(json('POST'), ctx(ID))).json()).toEqual({ ok: true });
    expect((await (await overview()).json()).open).toBeNull();
    expect((await discard(json('POST'), ctx(ID))).status).toBe(409);
  });

  it('returns the recap', async () => {
    expect(await (await recap(json('GET'), ctx(ID))).json()).toEqual({ text: '# Session 1\n' });
    expect((await recap(json('GET'), ctx('session-09'))).status).toBe(404);
  });

  it('rejects bad ids, unknown ingests, and works only with a campaign', async () => {
    expect((await getIngest(json('GET'), ctx('../etc'))).status).toBe(400);
    expect((await getIngest(json('GET'), ctx('session-02'))).status).toBe(404);
    delete process.env.VAULT_PATH;
    expect((await overview()).status).toBe(409);
  });
});
