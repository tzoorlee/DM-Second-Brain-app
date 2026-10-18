import type { StudioEvent } from '../../utils/studio-ai';
import type { Inconsistency, StepState } from '../../utils/studio-state';

export type { Inconsistency, StepState, StudioEvent };

export interface StepSummary {
  n: number;
  id: string;
  title: string;
  kind: 'worldbible' | 'file' | 'worldbuilding' | 'srd' | 'summary';
  status: StepState['status'];
  usage: StepState['usage'];
}

// Answer of GET /api/studio
export interface StudioOverview {
  aiAvailable: boolean;
  model: string;
  hasSessions: boolean;
  published: boolean;
  rulesEdition: string | null;
  ingestCommand: string;
  steps: StepSummary[];
}

export type StepWithDraft = StepState & { draft: string };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body as T;
}

const send = (url: string, method: string, body: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const studioApi = {
  overview: () => fetch('/api/studio').then(r => json<StudioOverview>(r)),
  step: (n: number) => fetch(`/api/studio/steps/${n}`).then(r => json<StepWithDraft>(r)),
  update: (n: number, body: Record<string, unknown>) => send(`/api/studio/steps/${n}`, 'PUT', body).then(r => json<StepWithDraft>(r)),
  approve: (n: number, skipCheck = false) =>
    send(`/api/studio/steps/${n}/approve`, 'POST', { skipCheck }).then(r => json<{ written?: string[]; issues?: Inconsistency[] }>(r)),
  fix: (n: number, inconsistencyId: string) => send(`/api/studio/steps/${n}/fix`, 'POST', { inconsistencyId }).then(r => json<{ targetStep: number | null }>(r)),
  srd: (edition: string) => send('/api/studio/srd', 'POST', { edition }).then(r => json<{ files: number }>(r)),
  deviation: (text: string) => send('/api/studio/deviations', 'POST', { text }).then(r => json<{ ok: true }>(r)),

  // Streams one chat exchange; calls onEvent for every NDJSON line
  async chat(n: number, message: string, onEvent: (e: StudioEvent) => void) {
    try {
      await this.streamChat(n, message, onEvent);
    } catch {
      onEvent({ type: 'error', message: 'The connection dropped before the answer was complete. Reload the page to see whether it was saved.' });
    }
  },

  async streamChat(n: number, message: string, onEvent: (e: StudioEvent) => void) {
    const res = await send('/api/studio/chat', 'POST', { n, message });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      onEvent({ type: 'error', message: body.error || `Request failed (${res.status}).` });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      buffer += decoder.decode(read.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer));
  },
};

// `- **Label**: value` lines of the step 1 draft
export function draftField(draft: string, label: string): string {
  const m = draft.match(new RegExp(`^- \\*\\*${label}\\*\\*:[ \\t]?(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

export function withDraftField(draft: string, heading: string, label: string, value: string): string {
  const line = `- **${label}**: ${value}`;
  const re = new RegExp(`^- \\*\\*${label}\\*\\*:.*$`, 'm');
  if (re.test(draft)) return draft.replace(re, () => line);
  const lines = draft.split('\n');
  const at = lines.findIndex(l => l.trim() === `## ${heading}`);
  if (at === -1) return `${draft.replace(/\n*$/, '\n\n')}## ${heading}\n${line}\n`;
  let end = at + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  lines.splice(end, 0, line);
  return lines.join('\n');
}
