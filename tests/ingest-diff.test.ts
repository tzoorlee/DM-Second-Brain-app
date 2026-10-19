import { describe, expect, it } from 'vitest';
import { diffRows } from '../src/app/components/ingest/DiffView';

describe('Review diff', () => {
  it('shows changes with 3 lines of context and collapses the rest', () => {
    const before = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const after = before.replace('line 10\n', 'line ten\n');
    expect(diffRows(before, after)).toEqual([
      { kind: 'skip', text: '… 6 unchanged lines' },
      ...[7, 8, 9].map(n => ({ kind: 'same', text: `line ${n}` })),
      { kind: 'removed', text: 'line 10' },
      { kind: 'added', text: 'line ten' },
      ...[11, 12].map(n => ({ kind: 'same', text: `line ${n}` })),
    ]);
  });

  it('shows a new page as all added', () => {
    expect(diffRows('', '# A\nb\n')).toEqual([{ kind: 'added', text: '# A' }, { kind: 'added', text: 'b' }]);
  });
});
