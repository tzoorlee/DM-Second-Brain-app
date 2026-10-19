'use client';

import { diffLines } from 'diff';

const CONTEXT = 3;

interface Row {
  kind: 'added' | 'removed' | 'same' | 'skip';
  text: string;
}

// Line diff of a page: added lines green, removed red, and unchanged runs collapsed
// to CONTEXT lines around each change. A new page (no before) shows all its lines as added.
export function diffRows(before: string, after: string): Row[] {
  const rows: Row[] = [];
  for (const part of diffLines(before, after)) {
    const kind = part.added ? 'added' : part.removed ? 'removed' : 'same';
    for (const text of part.value.replace(/\n$/, '').split('\n')) rows.push({ kind, text });
  }
  const near = rows.map((_, i) => rows.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some(r => r.kind !== 'same'));
  const out: Row[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'same' || near[i]) {
      out.push(rows[i]);
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind === 'same' && !near[j]) j++;
    out.push({ kind: 'skip', text: `… ${j - i} unchanged line${j - i === 1 ? '' : 's'}` });
    i = j - 1;
  }
  return out;
}

export default function DiffView({ before, after }: { before: string | null; after: string | null }) {
  const rows = diffRows(before ?? '', after ?? '');
  return (
    <pre className="ingest-diff" aria-label="Changes to the page">
      {rows.map((r, i) => (
        <div key={i} className={`ingest-diff-${r.kind}`}>
          <span aria-hidden="true">{r.kind === 'added' ? '+ ' : r.kind === 'removed' ? '− ' : '  '}</span>
          {r.text || ' '}
        </div>
      ))}
    </pre>
  );
}
