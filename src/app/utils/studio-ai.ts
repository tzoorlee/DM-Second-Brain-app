import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { getEntity, searchEntities } from './search';
import { COHERENCE_SYSTEM, STEP_BRIEFS, STUDIO_ROLE } from './studio-prompts';
import { Inconsistency, loadStep, Proposal, saveStep, StepState } from './studio-state';
import { campaignHasSessions, getStep, readStepContent, WORLD_BIBLE, WORLDBUILDING_TOPICS, writeStepContent } from './studio-steps';
import { getCampaignRoot } from './vault';
import { getField, replaceSections } from './worldbible';

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type TextBlockParam = Anthropic.Beta.Messages.BetaTextBlockParam;
type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export interface TurnParams {
  system: TextBlockParam[];
  messages: MessageParam[];
  tools: Tool[];
}

// What report_inconsistency and the approval check return, before the app adds id and status
export interface IssueInput {
  file: string;
  quote: string;
  problem: string;
  proposed_fix: string;
  severity: 'error' | 'warning';
}

// The model behind the Studio. The real one talks to Anthropic; tests use a fake.
export interface StudioModel {
  name: string;
  streamTurn(params: TurnParams, onText: (text: string) => void): Promise<BetaMessage>;
  checkCoherence(system: string, prompt: string): Promise<IssueInput[]>;
  available(): Promise<boolean>;
}

export type StudioEvent =
  | { type: 'text'; text: string }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'inconsistency'; inconsistency: Inconsistency }
  | { type: 'done'; usage: StepState['usage'] }
  | { type: 'error'; message: string };

export const STUDIO_TOOLS: Tool[] = [
  {
    name: 'propose_edit',
    description: 'Propose the full new text of one section of the draft. The DM sees it highlighted and accepts or rejects it.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'The section heading without "## ", exactly as it appears in the draft.' },
        new_text: { type: 'string', description: 'The complete new body of the section, without the heading line.' },
        reason: { type: 'string', description: 'One sentence on why, for the DM.' },
      },
      required: ['section', 'new_text', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'report_inconsistency',
    description: 'Report a contradiction between the draft or the conversation and an earlier step, the established wiki, or published lore.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Campaign path it conflicts with, e.g. raw/world-bible.md, or "draft".' },
        quote: { type: 'string', description: 'A short exact quote of the conflicting text.' },
        problem: { type: 'string', description: 'The contradiction in one sentence.' },
        proposed_fix: { type: 'string', description: 'A fix the DM could accept.' },
        severity: { type: 'string', enum: ['error', 'warning'], description: '"warning" for published lore, "error" otherwise.' },
      },
      required: ['file', 'quote', 'problem', 'proposed_fix', 'severity'],
      additionalProperties: false,
    },
  },
];

// Sections a step may change: its world-bible headings, the worldbuilding topics, or
// any section (null) for whole-file steps. Steps without a draft own nothing.
export function ownedSections(n: number): string[] | null {
  const step = getStep(n);
  if (step.kind === 'worldbible') return step.headings!;
  if (step.kind === 'worldbuilding') return [...WORLDBUILDING_TOPICS];
  if (step.kind === 'file') return null;
  return [];
}

export function applyProposal(draft: string, section: string, newText: string): string {
  return replaceSections(draft, { [section]: newText.endsWith('\n') ? newText + '\n' : newText + '\n\n' });
}

const readIfExists = (rel: string) => {
  const abs = path.join(getCampaignRoot(), rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
};

function worldType(): 'homebrew' | 'published' {
  const world = getField(readIfExists(WORLD_BIBLE), 'Setting', 'World') ?? '';
  return /^(Published|Mixed)/i.test(world) ? 'published' : 'homebrew';
}

export function buildSystem(n: number): TextBlockParam[] {
  const step = getStep(n);
  const brief = STEP_BRIEFS[n];
  const owned = ownedSections(n);
  const lines = [
    `Current step: ${n} of 9 — ${step.title}.`,
    `Goal: ${brief.goal}`,
    owned === null
      ? 'The draft is a whole file: you may propose any of its "## " sections.'
      : owned.length
        ? `The draft holds these sections, the only ones you may propose: ${owned.map(h => `"${h}"`).join(', ')}.`
        : 'This step has no draft: do not call propose_edit.',
  ];
  if (brief.questions.length) lines.push('Guiding questions:', ...brief.questions.map(q => `- ${q}`));
  if (brief.published && worldType() === 'published') lines.push(`Published setting: ${brief.published}`);
  return [
    { type: 'text', text: STUDIO_ROLE },
    { type: 'text', text: lines.join('\n'), cache_control: { type: 'ephemeral' } },
  ];
}

const MAX_PAGE_CHARS = 4000;

// The campaign files the model reasons with. Once play has started, the wiki pages
// that match the message join them: established pages are the strongest constraint.
export function buildContext(n: number, message: string): string {
  const parts: string[] = [];
  const add = (rel: string, text: string) => text.trim() && parts.push(`### ${rel}\n${text.trim()}`);
  add(WORLD_BIBLE, readIfExists(WORLD_BIBLE));
  add('raw/house-rules.md', readIfExists('raw/house-rules.md'));
  const wb = path.join(getCampaignRoot(), 'raw', 'worldbuilding');
  if (fs.existsSync(wb)) {
    for (const f of fs.readdirSync(wb).filter(f => f.endsWith('.md') && f !== 'README.md').sort()) add(`raw/worldbuilding/${f}`, readIfExists(`raw/worldbuilding/${f}`));
  }
  const setting = path.join(getCampaignRoot(), 'raw', 'setting');
  if (fs.existsSync(setting)) {
    const files = fs.readdirSync(setting, { recursive: true }).map(String).filter(f => f.endsWith('.md') && f !== 'README.md');
    if (files.length) parts.push(`### raw/setting/ (reference files, ask the DM before using them)\n${files.map(f => `- ${f}`).join('\n')}`);
  }
  if (campaignHasSessions()) {
    add('wiki/index.md', readIfExists('wiki/index.md'));
    let hits = searchEntities(message, 'dm');
    if (hits.length === 0) {
      const words = message.split(/\W+/).filter(w => w.length > 3).sort((a, b) => b.length - a.length).slice(0, 3);
      hits = words.flatMap(w => searchEntities(w, 'dm'));
    }
    const seen = new Set<string>();
    for (const hit of hits) {
      if (seen.size >= 5 || seen.has(hit.relativePath)) continue;
      seen.add(hit.relativePath);
      const page = getEntity(hit.relativePath, 'dm');
      if (page) add(`wiki/${hit.relativePath}`, page.body.slice(0, MAX_PAGE_CHARS));
    }
  }
  return parts.join('\n\n') || '(the campaign files are still empty)';
}

const newId = () => crypto.randomBytes(4).toString('hex');

// One exchange of the chat: the DM's message, the model's answer and any tool calls.
// The state is saved only when the exchange completes, so a failure leaves the step as it was.
export async function runChatTurn(n: number, message: string, model: StudioModel, emit: (e: StudioEvent) => void): Promise<StepState> {
  const state = loadStep(n);
  const draft = state.draft ?? readStepContent(n);
  const owned = ownedSections(n);
  const tools = owned !== null && owned.length === 0 ? [] : STUDIO_TOOLS;
  const turn: MessageParam = {
    role: 'user',
    content: [
      { type: 'text', text: `<campaign_files>\n${buildContext(n, message)}\n</campaign_files>` },
      { type: 'text', text: `<current_draft step="${n}">\n${draft}\n</current_draft>` },
      { type: 'text', text: message },
    ],
  };
  // The context goes with this request only; the history keeps the DM's words
  const sent: MessageParam[] = [...state.messages, turn];
  const saved: MessageParam[] = [...state.messages, { role: 'user', content: message }];
  const proposals: Proposal[] = [];
  const inconsistencies: Inconsistency[] = [];
  const usage = { ...state.usage };

  try {
    for (let round = 0; round < 8; round++) {
      const reply = await model.streamTurn({ system: buildSystem(n), messages: sent, tools }, text => emit({ type: 'text', text }));
      usage.input += reply.usage.input_tokens;
      usage.output += reply.usage.output_tokens;
      usage.cacheRead += reply.usage.cache_read_input_tokens ?? 0;
      if (reply.stop_reason === 'refusal') {
        emit({ type: 'error', message: 'The model declined this request. Try rephrasing it.' });
        return state;
      }
      const assistant: MessageParam = { role: 'assistant', content: reply.content as MessageParam['content'] };
      sent.push(assistant);
      saved.push(assistant);
      if (reply.stop_reason !== 'tool_use') break;

      const results: ToolResult[] = [];
      for (const block of reply.content) {
        if (block.type !== 'tool_use') continue;
        const input = block.input as Record<string, string>;
        if (block.name === 'propose_edit') {
          if (owned !== null && !owned.includes(input.section)) {
            results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: `Step ${n} can only edit: ${owned.join(', ')}.` });
            continue;
          }
          const proposal: Proposal = { id: newId(), section: input.section, newText: input.new_text, reason: input.reason, status: 'pending' };
          proposals.push(proposal);
          emit({ type: 'proposal', proposal });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Shown to the DM as a pending proposal.' });
        } else if (block.name === 'report_inconsistency') {
          const inconsistency = toInconsistency(input as unknown as IssueInput);
          inconsistencies.push(inconsistency);
          emit({ type: 'inconsistency', inconsistency });
          results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Shown to the DM.' });
        } else {
          results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: `Unknown tool ${block.name}.` });
        }
      }
      const toolTurn: MessageParam = { role: 'user', content: results };
      sent.push(toolTurn);
      saved.push(toolTurn);
    }
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : 'The AI request failed.' });
    return state;
  }

  const next: StepState = {
    ...state,
    status: state.status === 'todo' ? 'in-progress' : state.status,
    messages: saved,
    proposals: [...state.proposals, ...proposals],
    inconsistencies: [...state.inconsistencies, ...inconsistencies],
    usage,
  };
  saveStep(next);
  emit({ type: 'done', usage });
  return next;
}

function toInconsistency(issue: IssueInput): Inconsistency {
  return {
    id: newId(),
    file: issue.file,
    quote: issue.quote,
    problem: issue.problem,
    proposedFix: issue.proposed_fix,
    severity: issue.severity === 'warning' ? 'warning' : 'error',
    status: 'open',
  };
}

// Writes an approved draft. With a model, a coherence check runs first; open issues
// are returned and nothing is written until the DM resolves them or skips the check.
export async function approveStep(
  n: number,
  draft: string,
  model: StudioModel | null,
  skipCheck: boolean,
): Promise<{ written: string[] } | { issues: Inconsistency[] }> {
  const step = getStep(n);
  const state = loadStep(n);
  if (model && !skipCheck && step.kind !== 'srd') {
    const prompt = `NEW DRAFT (step ${n}: ${step.title})\n${draft}\n\nAPPROVED FILES AND ESTABLISHED WIKI\n${buildContext(n, draft)}`;
    const issues = (await model.checkCoherence(COHERENCE_SYSTEM, prompt)).map(toInconsistency);
    if (issues.length) {
      saveStep({ ...state, draft, inconsistencies: [...state.inconsistencies.filter(i => i.status !== 'open'), ...issues] });
      return { issues };
    }
  }
  const written = writeStepContent(n, draft);
  saveStep({
    ...state,
    status: 'approved',
    draft: null,
    proposals: state.proposals.map(p => (p.status === 'pending' ? { ...p, status: 'rejected' } : p)),
    inconsistencies: state.inconsistencies.map(i => (i.status === 'open' ? { ...i, status: 'kept' } : i)),
  });
  return { written };
}

const IssueSchema = z.object({
  issues: z.array(
    z.object({
      file: z.string(),
      quote: z.string(),
      problem: z.string(),
      proposed_fix: z.string(),
      severity: z.enum(['error', 'warning']),
    }),
  ),
});

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function createAnthropicModel(): StudioModel {
  const client = new Anthropic();
  const name = process.env.STUDIO_MODEL?.trim() || 'claude-opus-5';
  let checked: { at: number; ok: boolean } | null = null;

  return {
    name,
    async streamTurn({ system, messages, tools }, onText) {
      const stream = client.beta.messages.stream({
        model: name,
        max_tokens: 64000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        system,
        tools,
        messages,
      });
      stream.on('text', onText);
      return stream.finalMessage();
    },
    async checkCoherence(system, prompt) {
      const response = await client.beta.messages.parse({
        model: name,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        system,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: betaZodOutputFormat(IssueSchema) },
      });
      if (response.stop_reason === 'refusal') throw new Error('The model declined to check this step.');
      return response.parsed_output?.issues ?? [];
    },
    async available() {
      if (checked && Date.now() - checked.at < 5 * 60_000) return checked.ok;
      try {
        await client.models.retrieve(name);
        checked = { at: Date.now(), ok: true };
      } catch {
        checked = { at: Date.now(), ok: false };
      }
      return checked.ok;
    },
  };
}
