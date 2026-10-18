import fs from 'fs';
import path from 'path';
import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getStudio } from '../src/app/api/studio/route';
import { GET as getStepRoute, PUT as putStep } from '../src/app/api/studio/steps/[n]/route';
import { POST as approve } from '../src/app/api/studio/steps/[n]/approve/route';
import { POST as fix } from '../src/app/api/studio/steps/[n]/fix/route';
import { POST as chat } from '../src/app/api/studio/chat/route';
import { POST as srd } from '../src/app/api/studio/srd/route';
import { POST as deviations } from '../src/app/api/studio/deviations/route';
import type { IssueInput, StudioModel } from '../src/app/utils/studio-ai';
import { setStudioModel } from '../src/app/utils/studio-model';
import { loadStep, saveStep } from '../src/app/utils/studio-state';
import { getField } from '../src/app/utils/worldbible';
import { isolateEnv, makeCampaign, makeTempDir } from './helpers';

const BIBLE = '# World Bible\n\n## Campaign\n- **Name**: Test\n- **Rules edition**: x\n\n## Setting\n- **World**: Published: Forgotten Realms\n- **Deviations from the published canon**:\n  - (none)\n\n## Naming Conventions\n- (names)\n';

let root: string;
let available = true;
let issues: IssueInput[] = [];
const fake: StudioModel = {
  name: 'fake-model',
  async streamTurn(_params, onText) {
    onText('Hi');
    return {
      content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
    } as unknown as Anthropic.Beta.Messages.BetaMessage;
  },
  async checkCoherence() {
    return issues;
  },
  async available() {
    return available;
  },
};

const req = (body: unknown) => new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) });
const put = (body: unknown) => new Request('http://localhost/x', { method: 'PUT', body: JSON.stringify(body) });
const ctx = (n: string | number) => ({ params: Promise.resolve({ n: String(n) }) });
const bible = () => fs.readFileSync(path.join(root, 'raw', 'world-bible.md'), 'utf-8');

describe('Studio API', () => {
  isolateEnv();
  beforeEach(() => {
    root = makeCampaign(makeTempDir(), 'test');
    fs.mkdirSync(path.join(root, 'raw'), { recursive: true });
    fs.writeFileSync(path.join(root, 'raw', 'world-bible.md'), BIBLE);
    process.env.VAULT_PATH = root;
    available = true;
    issues = [];
    setStudioModel(fake);
  });
  afterEach(() => setStudioModel(null));

  it('GET /api/studio describes the steps and the AI', async () => {
    const body = await (await getStudio()).json();
    expect(body).toMatchObject({ aiAvailable: true, model: 'fake-model', hasSessions: false, published: true, rulesEdition: 'x' });
    expect(body.steps).toHaveLength(9);
    expect(body.steps[0]).toMatchObject({ n: 1, id: 'basics', status: 'todo' });
    expect(body.ingestCommand).toContain('claude "design ingest of raw/worldbuilding"');
  });

  it('GET a step returns its draft from the files', async () => {
    const body = await (await getStepRoute(new Request('http://x'), ctx(4))).json();
    expect(body.draft).toBe('## Naming Conventions\n- (names)\n');
  });

  it('PUT saves a draft and accepts a proposal', async () => {
    await putStep(put({ draft: '## Naming Conventions\n- Mine.\n' }), ctx(4));
    saveStep({ ...loadStep(4), proposals: [{ id: 'p1', section: 'Naming Conventions', newText: '- Hard consonants.', reason: 'r', status: 'pending' }] });
    const body = await (await putStep(put({ proposalId: 'p1', proposalStatus: 'accepted' }), ctx(4))).json();
    expect(body.draft).toContain('- Hard consonants.');
    expect(body.proposals[0].status).toBe('accepted');
  });

  it('chat streams NDJSON events', async () => {
    const res = await chat(req({ n: 4, message: 'hello' }));
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await res.text()).trim().split('\n').map(l => JSON.parse(l));
    expect(lines[0]).toEqual({ type: 'text', text: 'Hi' });
    expect(lines.at(-1).type).toBe('done');
  });

  it('chat answers 503 without credentials', async () => {
    available = false;
    expect((await chat(req({ n: 4, message: 'hello' }))).status).toBe(503);
  });

  it('approve writes, or returns the issues first', async () => {
    issues = [{ file: 'raw/house-rules.md', quote: 'q', problem: 'p', proposed_fix: 'f', severity: 'error' }];
    const first = await (await approve(req({}), ctx(4))).json();
    expect(first.issues).toHaveLength(1);
    const second = await (await approve(req({ skipCheck: true }), ctx(4))).json();
    expect(second.written).toEqual(['raw/world-bible.md']);
  });

  it('approve without credentials skips the check', async () => {
    available = false;
    issues = [{ file: 'x', quote: 'q', problem: 'p', proposed_fix: 'f', severity: 'error' }];
    expect((await (await approve(req({}), ctx(4))).json()).written).toEqual(['raw/world-bible.md']);
  });

  it('fix sends an inconsistency to the step that owns the file', async () => {
    saveStep({ ...loadStep(7), inconsistencies: [{ id: 'i1', file: 'raw/house-rules.md', quote: 'q', problem: 'p', proposedFix: 'f', severity: 'error', status: 'open' }] });
    const body = await (await fix(req({ inconsistencyId: 'i1' }), ctx(7))).json();
    expect(body).toEqual({ targetStep: 5 });
    expect(loadStep(5).inconsistencies[0]).toMatchObject({ problem: 'p', status: 'open' });
    expect(loadStep(7).inconsistencies[0].status).toBe('fixed');
  });

  it('fix cannot target the wiki', async () => {
    saveStep({ ...loadStep(7), inconsistencies: [{ id: 'i1', file: 'wiki/a.md', quote: 'q', problem: 'p', proposedFix: 'f', severity: 'error', status: 'open' }] });
    expect(await (await fix(req({ inconsistencyId: 'i1' }), ctx(7))).json()).toEqual({ targetStep: null });
  });

  it('srd "none" records the choice and approves step 6', async () => {
    expect((await srd(req({ edition: 'none' }))).status).toBe(200);
    expect(getField(bible(), 'Campaign', 'Rules edition')).toBe('none');
    expect(loadStep(6).status).toBe('approved');
  });

  it('deviations are added to the Setting', async () => {
    await deviations(req({ text: 'Elminster is dead.' }));
    expect(bible()).toContain('  - Elminster is dead.');
  });

  it('rejects a bad step and answers 409 without a campaign', async () => {
    expect((await getStepRoute(new Request('http://x'), ctx('12'))).status).toBe(400);
    delete process.env.VAULT_PATH;
    expect((await getStudio()).status).toBe(409);
  });
});
