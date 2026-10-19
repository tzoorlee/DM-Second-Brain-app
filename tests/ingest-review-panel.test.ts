import { describe, expect, it } from 'vitest';
import { leftOut } from '../src/app/components/ingest/ReviewPanel';

describe('Review panel', () => {
  it('counts pages left out of apply, including those with a change request not sent', () => {
    expect(
      leftOut([
        { path: 'a.md', kind: 'new', review: 'approved' },
        { path: 'b.md', kind: 'new', review: 'pending' },
        { path: 'c.md', kind: 'changed', review: 'pending', note: 'fix' },
        { path: 'd.md', kind: 'changed', review: 'rejected' },
      ]),
    ).toEqual({ pending: ['b.md'], asked: ['c.md'] });
  });
});
