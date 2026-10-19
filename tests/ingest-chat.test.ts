import { describe, expect, it } from 'vitest';
import { canContinue } from '../src/app/components/ingest/IngestChat';

const view = (phase: string, last: 'user' | 'assistant') => ({ phase, messages: [{ role: last, content: 'x' }] }) as never;

describe('Ingest chat', () => {
  it('offers Continue while working, and in the discussion when the agent owes an answer or failed', () => {
    expect(canContinue(view('working', 'assistant'), '')).toBe(true);
    expect(canContinue(view('discuss', 'assistant'), '')).toBe(false);
    // e.g. the connection dropped right after Start, then the page was reloaded
    expect(canContinue(view('discuss', 'user'), '')).toBe(true);
    expect(canContinue(view('discuss', 'assistant'), 'The answer was cut off')).toBe(true);
    expect(canContinue(view('review', 'user'), 'x')).toBe(false);
  });
});
