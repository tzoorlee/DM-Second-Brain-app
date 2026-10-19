'use client';

import { useEffect, useState } from 'react';
import DiffView from './DiffView';
import { Change, ingestApi, IngestView } from './api';

const GROUPS: { title: string; of: (c: Change) => boolean }[] = [
  { title: 'New', of: c => c.kind === 'new' && c.path !== 'index.md' && c.path !== 'log.md' },
  { title: 'Changed', of: c => c.kind === 'changed' && c.path !== 'index.md' && c.path !== 'log.md' },
  { title: 'Moved', of: c => c.kind === 'moved' },
  { title: 'Index & log', of: c => c.path === 'index.md' || c.path === 'log.md' },
];

// Changes Apply leaves out: still pending, or with a change request not sent to the agent
export function leftOut(changes: Change[]): { pending: string[]; asked: string[] } {
  const open = changes.filter(c => c.review === 'pending');
  return { pending: open.filter(c => !c.note).map(c => c.path), asked: open.filter(c => c.note).map(c => c.path) };
}

const mark = (c: Change) => (c.review === 'approved' ? '✓' : c.review === 'rejected' ? '✗' : c.note ? '✎' : '•');

interface ReviewPanelProps {
  view: IngestView;
  busy: boolean;
  onChanged: (view: IngestView) => void;
  onRequestChanges: () => void;
  onApplied: (message: string) => void;
}

export default function ReviewPanel({ view, busy, onChanged, onRequestChanges, onApplied }: ReviewPanelProps) {
  const [selected, setSelected] = useState<string | null>(view.changes[0]?.path ?? null);
  const [page, setPage] = useState<{ before: string | null; after: string | null } | null>(null);
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  // How each conflict is settled: keep the wiki's version or take the agent's
  const [resolved, setResolved] = useState<Record<string, 'theirs' | 'agent'>>({});
  const [error, setError] = useState('');

  const change = view.changes.find(c => c.path === selected) ?? null;

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    ingestApi
      .page(view.id, selected)
      .then(p => !cancelled && setPage(p))
      .catch(err => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [view.id, selected, view.changes]);

  const act = async (body: Parameters<typeof ingestApi.review>[1]) => {
    try {
      setError('');
      onChanged(await ingestApi.review(view.id, body));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const select = (p: string) => {
    setSelected(p);
    setPage(null);
    setAsking(false);
    setNote(view.changes.find(c => c.path === p)?.note ?? '');
  };

  const asked = view.changes.filter(c => c.review === 'pending' && c.note);
  const approved = view.changes.filter(c => c.review === 'approved');
  const pending = view.changes.filter(c => c.review === 'pending' && !c.note);
  const unresolved = view.conflicts.filter(p => !resolved[p]);

  const apply = async () => {
    const out = leftOut(view.changes);
    const parts = [
      out.pending.length ? `${out.pending.length} change(s) still pending` : '',
      out.asked.length ? `${out.asked.length} change request(s) not sent to the agent` : '',
    ].filter(Boolean);
    if (parts.length && !window.confirm(`${parts.join(' and ')}: those pages will be left out. Apply the approved ones?`)) return;
    if (view.linkWarnings.length && !window.confirm('Some approved pages link to new pages you rejected. Apply anyway?')) return;
    try {
      setError('');
      const keepTheirs = Object.keys(resolved).filter(p => resolved[p] === 'theirs');
      const takeAgent = Object.keys(resolved).filter(p => resolved[p] === 'agent');
      const result = await ingestApi.apply(view.id, keepTheirs, takeAgent);
      onApplied(`Applied: ${result.written.length} page(s) written, ${result.moved.length} moved.`);
    } catch (err) {
      setError((err as Error).message);
      // A conflict found at the last moment shows up in the refreshed view
      const fresh = await ingestApi.state(view.id).catch(() => null);
      if (fresh) onChanged(fresh);
    }
  };

  return (
    <section className="studio-draft ingest-review" aria-label="Review">
      <div className="studio-draft-header">
        <h2>Review</h2>
        <span className="studio-draft-file">{approved.length}/{view.changes.length} approved</span>
      </div>
      {view.summary && <p className="ingest-summary">{view.summary}</p>}

      <div className="ingest-changes">
        {GROUPS.map(g => {
          const items = view.changes.filter(g.of);
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <h3>{g.title}</h3>
              <ul>
                {items.map(c => (
                  <li key={c.path}>
                    <button
                      type="button"
                      className={`ingest-change ${c.review}${c.path === selected ? ' current' : ''}`}
                      aria-current={c.path === selected ? 'true' : undefined}
                      onClick={() => select(c.path)}
                    >
                      <span aria-hidden="true">{mark(c)}</span> {c.kind === 'moved' ? `${c.from} → ${c.path}` : c.path}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {change && (
        <div className="ingest-page">
          <div className="studio-approve">
            <button type="button" onClick={() => act({ path: change.path, review: 'approved' })} disabled={busy}>Approve</button>
            <button type="button" className="secondary" onClick={() => act({ path: change.path, review: 'rejected' })} disabled={busy}>Reject</button>
            <button type="button" className="secondary" onClick={() => setAsking(a => !a)} disabled={busy}>Ask for changes</button>
          </div>
          {asking && (
            <form
              className="ingest-note"
              onSubmit={e => {
                e.preventDefault();
                if (note.trim()) act({ path: change.path, note: note.trim() }).then(() => setAsking(false));
              }}
            >
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} aria-label="What to change" placeholder="What should the agent change on this page?" />
              <button type="submit" disabled={!note.trim()}>Save note</button>
            </form>
          )}
          {change.note && !asking && <p className="studio-step-usage">Asked: {change.note}</p>}
          {page ? <DiffView before={page.before} after={page.after} /> : <p className="studio-step-usage">Loading…</p>}
        </div>
      )}

      {view.linkWarnings.length > 0 && (
        <div className="studio-issue warning" role="alert">
          <strong>Links to rejected pages</strong>
          <ul>
            {view.linkWarnings.map(w => (
              <li key={`${w.from}>${w.to}`}><code>{w.from}</code> links to <code>{w.to}</code></li>
            ))}
          </ul>
        </div>
      )}

      {view.conflicts.length > 0 && (
        <div className="studio-issue" role="alert">
          <strong>Changed in the wiki during the ingest</strong>
          {view.conflicts.map(p => (
            <div key={p} className="ingest-conflict">
              <code>{p}</code>
              <label><input type="radio" name={`c-${p}`} checked={resolved[p] === 'theirs'} onChange={() => setResolved(r => ({ ...r, [p]: 'theirs' }))} /> Keep the wiki&apos;s</label>
              <label><input type="radio" name={`c-${p}`} checked={resolved[p] === 'agent'} onChange={() => setResolved(r => ({ ...r, [p]: 'agent' }))} /> Take the agent&apos;s</label>
            </div>
          ))}
        </div>
      )}

      {error && <div className="studio-error" role="alert">{error}</div>}

      <div className="studio-approve">
        <button type="button" className="secondary" onClick={() => act({ approveAll: true })} disabled={busy || pending.length === 0}>Approve all</button>
        {asked.length > 0 && (
          <button type="button" className="secondary" onClick={onRequestChanges} disabled={busy}>Send {asked.length} request(s) to the agent</button>
        )}
        <button type="button" onClick={apply} disabled={busy || approved.length === 0 || unresolved.length > 0}>Apply approved</button>
      </div>
    </section>
  );
}
