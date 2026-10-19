import { describe, expect, it } from 'vitest';
import { bubblesOf, canContinue } from '../src/app/components/ingest/IngestChat';
import { idForItemFile, pickSource } from '../src/app/components/ingest/api';

const view = (phase: string, last: 'user' | 'assistant') => ({ phase, messages: [{ role: last, content: 'x' }] }) as never;

describe('Ingest chat', () => {
  it('shows "✎ path" only for writes that were staged', () => {
    const v = {
      messages: [
        { role: 'assistant', content: [
          { type: 'tool_use', id: 'a', name: 'write_page', input: { path: 'npcs/ok.md' } },
          { type: 'tool_use', id: 'b', name: 'write_page', input: { path: 'npcs/refused.md' } },
        ] },
        { role: 'user', content: [
          { type: 'tool_result', tool_use_id: 'a', content: 'Staged npcs/ok.md.' },
          { type: 'tool_result', tool_use_id: 'b', content: 'refused', is_error: true },
        ] },
      ],
    } as never;
    expect(bubblesOf(v)).toEqual([{ who: 'staged', text: 'npcs/ok.md' }]);
  });

  it('offers Continue while working, and in the discussion when the agent owes an answer or failed', () => {
    expect(canContinue(view('working', 'assistant'), '')).toBe(true);
    expect(canContinue(view('discuss', 'assistant'), '')).toBe(false);
    // e.g. the connection dropped right after Start, then the page was reloaded
    expect(canContinue(view('discuss', 'user'), '')).toBe(true);
    expect(canContinue(view('discuss', 'assistant'), 'The answer was cut off')).toBe(true);
    expect(canContinue(view('review', 'user'), 'x')).toBe(false);
  });

  it('finds the ingest id of a Studio item file', () => {
    expect(idForItemFile('raw/worldbuilding/2026-10-05-the-old-mill.md')).toBe('design-2026-10-05-the-old-mill');
    expect(idForItemFile('raw/interludes/2026-10-05-the-storm.md')).toBeNull();
    expect(idForItemFile('raw/worldbuilding/regions.md')).toBeNull();
  });

  it('picks a source the page can open', () => {
    const src = (id: string, status: string) => ({ id, status }) as never;
    const all = [src('session-01', 'ingested'), src('design-initial', 'ingested'), src('design-invalid-0', 'invalid-name')];
    // everything done: the last real source, never an invalid name
    expect(pickSource(all, null, null, null)).toBe('design-initial');
    // a link to a source that isn't there falls back instead of failing
    expect(pickSource(all, 'design-2026-01-01-gone', null, null)).toBe('design-initial');
    expect(pickSource([...all, src('session-02', 'not-ingested')], null, null, null)).toBe('session-02');
    expect(pickSource(all, 'session-01', null, 'design-initial')).toBe('session-01');
    expect(pickSource(all, null, null, 'design-initial')).toBe('design-initial');
    expect(pickSource([], null, null, null)).toBeNull();
  });
});
