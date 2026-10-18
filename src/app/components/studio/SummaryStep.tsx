'use client';

import { useState } from 'react';
import { StudioOverview, studioApi } from './api';

const MARK = { todo: '○', 'in-progress': '●', approved: '✓' } as const;

// Step 9: what's ready, a last coherence check, and the command for the design ingest
export default function SummaryStep({ overview, onChanged }: { overview: StudioOverview; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  const check = async () => {
    setBusy(true);
    setResult('');
    try {
      const res = await studioApi.approve(9, !overview.aiAvailable);
      setResult(res.issues?.length ? `${res.issues.length} inconsistencies found: see the chat.` : 'No contradictions found.');
    } catch (err) {
      setResult((err as Error).message);
    }
    setBusy(false);
    onChanged();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(overview.ingestCommand);
    setCopied(true);
  };

  return (
    <section className="studio-draft studio-summary" aria-label="Summary">
      <header className="studio-draft-header">
        <h2>Summary</h2>
      </header>
      <ul className="studio-summary-list">
        {overview.steps.filter(s => s.n < 9).map(s => (
          <li key={s.n} className={s.status}>
            {MARK[s.status]} {s.n}. {s.title}
          </li>
        ))}
      </ul>
      {overview.aiAvailable && (
        <div className="studio-approve">
          {result && <p className="studio-result ok" role="status">{result}</p>}
          <button type="button" onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Run the final check'}</button>
        </div>
      )}
      <h3>Next: the design ingest</h3>
      <p>
        Your files are in <code>raw/</code>. The agent turns them into wiki pages, marked <em>prepared</em> until you play
        them. Run this in a terminal, then answer its questions:
      </p>
      <pre className="studio-command">{overview.ingestCommand}</pre>
      <button type="button" className="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    </section>
  );
}
