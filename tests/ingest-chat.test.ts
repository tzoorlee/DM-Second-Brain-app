import { describe, expect, it } from 'vitest';
import { bubblesOf, canContinue } from '../src/app/components/ingest/IngestChat';

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
});
