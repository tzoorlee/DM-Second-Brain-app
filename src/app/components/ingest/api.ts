import type { IngestEvent } from '../../utils/ingest-agent';
import type { SourceInfo } from '../../utils/ingest-sources';
import type { Change, IngestState } from '../../utils/ingest-state';

export type { Change, IngestEvent, SourceInfo };

// Answer of GET /api/ingest
export interface IngestOverview {
  aiAvailable: boolean;
  model: string;
  // command: the same ingest from a terminal (null for an invalid name)
  sources: (SourceInfo & { command: string | null })[];
  open: string | null;
  terminalCommand: string;
}

// Answer of GET /api/ingest/:id
export type IngestView = IngestState & {
  sourceChanged: boolean;
  linkWarnings: { from: string; to: string }[];
  conflicts: string[];
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `Request failed (${res.status}).`), { body, status: res.status });
  return body as T;
}

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

// Reads an NDJSON stream of IngestEvents; a request error or a dropped connection becomes an error event
async function stream(url: string, body: unknown, onEvent: (e: IngestEvent) => void) {
  try {
    const res = await send(url, 'POST', body);
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      onEvent({ type: 'error', message: err.error || `Request failed (${res.status}).` });
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
  } catch {
    onEvent({ type: 'error', message: 'The connection dropped before the agent was done. Its work so far is saved: reload, then Continue.' });
  }
}

export const ingestApi = {
  overview: () => fetch('/api/ingest', { cache: 'no-store' }).then(r => json<IngestOverview>(r)),
  // null when the session has no ingest yet
  state: async (id: string) => {
    const res = await fetch(`/api/ingest/${id}`, { cache: 'no-store' });
    return res.status === 404 ? null : json<IngestView>(res);
  },
  review: (id: string, body: { path?: string; review?: 'approved' | 'rejected'; note?: string; approveAll?: true }) =>
    send(`/api/ingest/${id}`, 'PUT', body).then(r => json<IngestView>(r)),
  page: (id: string, path: string) =>
    fetch(`/api/ingest/${id}/page?path=${encodeURIComponent(path)}`, { cache: 'no-store' }).then(r =>
      json<{ before: string | null; after: string | null }>(r),
    ),
  apply: (id: string, keepTheirs: string[], takeAgent: string[]) =>
    send(`/api/ingest/${id}/apply`, 'POST', { keepTheirs, takeAgent }).then(r => json<{ written: string[]; moved: { from: string; to: string }[] }>(r)),
  source: (id: string) => fetch(`/api/ingest/${id}/source`, { cache: 'no-store' }).then(r => json<{ text: string }>(r)),
  discard: (id: string) => send(`/api/ingest/${id}/discard`, 'POST').then(r => json<{ ok: true }>(r)),
  start: (id: string, onEvent: (e: IngestEvent) => void) => stream(`/api/ingest/${id}/start`, {}, onEvent),
  chat: (id: string, body: { message?: string; proceed?: true; continue?: true }, onEvent: (e: IngestEvent) => void) =>
    stream(`/api/ingest/${id}/chat`, body, onEvent),
  requestChanges: (id: string, onEvent: (e: IngestEvent) => void) => stream(`/api/ingest/${id}/changes`, {}, onEvent),
};

// The ingest id of a Studio item's file: a dated design file (+ Prepare). Interludes have none yet.
export function idForItemFile(file: string): string | null {
  const m = /^raw\/worldbuilding\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\.md$/.exec(file);
  return m ? `design-${m[1]}` : null;
}
