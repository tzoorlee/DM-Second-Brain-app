'use client';

import { useEffect, useState } from 'react';
import { StepWithDraft, studioApi } from './api';
import BasicsForm from './BasicsForm';
import RulesChecklist from './RulesChecklist';

interface DraftPanelProps {
  step: StepWithDraft;
  title: string;
  fileLabel: string;
  onChanged: () => void;
}

// The page remounts this panel (key) when the step changes; within a step the
// panel keeps its own text and takes the server's draft after an accepted proposal
export default function DraftPanel({ step, title, fileLabel, onChanged }: DraftPanelProps) {
  const [text, setText] = useState(step.draft);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'issues' | 'error'; message: string } | null>(null);

  // Ask before leaving with unsaved edits
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (next: string) => {
    setText(next);
    setDirty(true);
    setResult(null);
  };

  const save = async () => {
    if (!dirty) return;
    await studioApi.update(step.n, { draft: text });
    setDirty(false);
  };

  const decide = async (proposalId: string, proposalStatus: 'accepted' | 'rejected') => {
    try {
      await save();
      const updated = await studioApi.update(step.n, { proposalId, proposalStatus });
      setText(updated.draft);
      setDirty(false);
      onChanged();
    } catch (err) {
      setResult({ kind: 'error', message: (err as Error).message });
    }
  };

  const approve = async (skipCheck: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      await save();
      const res = await studioApi.approve(step.n, skipCheck);
      if (res.issues?.length) {
        setResult({ kind: 'issues', message: `${res.issues.length} inconsistenc${res.issues.length === 1 ? 'y' : 'ies'} found: see the chat. Fix them, or approve anyway.` });
      } else {
        setResult({ kind: 'ok', message: res.written?.length ? `Saved: ${res.written.join(', ')}` : 'Step approved.' });
      }
    } catch (err) {
      setResult({ kind: 'error', message: (err as Error).message });
    }
    setBusy(false);
    onChanged();
  };

  const pending = step.proposals.filter(p => p.status === 'pending');

  return (
    <section className="studio-draft" aria-label="Draft">
      <header className="studio-draft-header">
        <h2>{title}</h2>
        <span className="studio-draft-file">{fileLabel}</span>
      </header>

      {step.n === 1 && <BasicsForm draft={text} onChange={edit} />}
      {step.n === 5 && <RulesChecklist draft={text} onChange={edit} />}

      {pending.map(p => (
        <div key={p.id} className="studio-proposal">
          <div className="studio-proposal-head">
            <strong>Proposed: {p.section}</strong>
            <span>
              <button type="button" onClick={() => decide(p.id, 'accepted')} aria-label={`Accept the proposal for ${p.section}`}>✓</button>
              <button type="button" className="secondary" onClick={() => decide(p.id, 'rejected')} aria-label={`Reject the proposal for ${p.section}`}>✗</button>
            </span>
          </div>
          <p className="studio-proposal-reason">{p.reason}</p>
          <pre>{p.newText}</pre>
        </div>
      ))}

      <textarea
        className="studio-draft-text"
        value={text}
        onChange={e => edit(e.target.value)}
        onBlur={() => save().catch(err => setResult({ kind: 'error', message: (err as Error).message }))}
        aria-label="Draft text"
        spellCheck
      />

      <div className="studio-approve">
        {result && <p className={`studio-result ${result.kind}`} role="status">{result.message}</p>}
        {(result?.kind === 'issues' || result?.kind === 'error') && (
          <button type="button" className="secondary" onClick={() => approve(true)} disabled={busy}>
            {result.kind === 'issues' ? 'Approve anyway' : 'Approve without the check'}
          </button>
        )}
        <button type="button" onClick={() => approve(false)} disabled={busy}>
          {busy ? 'Checking…' : step.status === 'approved' && !dirty ? 'Approve again' : 'Approve step'}
        </button>
      </div>
    </section>
  );
}
