'use client';

import { useState } from 'react';
import { ItemSummary, StepSummary, studioApi } from './api';

const MARK = { todo: '○', 'in-progress': '●', approved: '✓' } as const;
const ITEM_STATUS = { draft: 'draft', written: 'written — ready to ingest', ingested: 'ingested ✓' } as const;

interface StepListProps {
  steps: StepSummary[];
  items: ItemSummary[];
  current: number;
  hasSessions: boolean;
  latestSession: string | null;
  onSelect: (n: number) => void;
}

const tokens = (usage: StepSummary['usage']) =>
  usage.input + usage.output > 0 ? `${usage.input.toLocaleString()} in · ${usage.output.toLocaleString()} out tokens` : '';

export default function StepList({ steps, items, current, hasSessions, latestSession, onSelect }: StepListProps) {
  const [form, setForm] = useState<'prepare' | 'interlude' | null>(null);
  const [title, setTitle] = useState('');
  const [dateInWorld, setDateInWorld] = useState('');
  const [afterSession, setAfterSession] = useState(latestSession ?? '');
  const [error, setError] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError('');
    try {
      const { n } = await studioApi.createItem({ kind: form, title, ...(form === 'interlude' ? { dateInWorld, afterSession } : {}) });
      setForm(null);
      setTitle('');
      setDateInWorld('');
      onSelect(n);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const open = (kind: 'prepare' | 'interlude') => {
    setForm(form === kind ? null : kind);
    setAfterSession(latestSession ?? '');
    setError('');
  };

  return (
    <nav className="studio-steps" aria-label="Studio steps">
      <ol>
        {steps.map(step => (
          <li key={step.n}>
            <button
              type="button"
              className={`studio-step${step.n === current ? ' current' : ''} ${step.status}`}
              aria-current={step.n === current ? 'step' : undefined}
              onClick={() => onSelect(step.n)}
            >
              <span className="studio-step-mark" aria-label={step.status}>{MARK[step.status]}</span>
              <span className="studio-step-title">
                {step.n}. {step.title}
                {tokens(step.usage) && <span className="studio-step-usage">{tokens(step.usage)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="studio-later">
        <div className="studio-later-buttons">
          <button type="button" disabled={!hasSessions} aria-expanded={form === 'prepare'} onClick={() => open('prepare')}>+ Prepare</button>
          <button type="button" disabled={!hasSessions} aria-expanded={form === 'interlude'} onClick={() => open('interlude')}>+ Interlude</button>
        </div>
        {!hasSessions && <p>Available after your first session.</p>}
        {form && (
          <form className="studio-item-form" onSubmit={create}>
            <label>
              {form === 'prepare' ? 'What are you preparing?' : 'What happened off-screen?'}
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder={form === 'prepare' ? 'The Frozen North' : 'The burning of Ashford'} autoFocus />
            </label>
            {form === 'interlude' && (
              <>
                <label>
                  When, in the world
                  <input value={dateInWorld} onChange={e => setDateInWorld(e.target.value)} placeholder="1492-Flamerule-03" />
                </label>
                <label>
                  After session
                  <input value={afterSession} onChange={e => setAfterSession(e.target.value)} placeholder="session-14" />
                </label>
              </>
            )}
            {error && <p className="studio-error" role="alert">{error}</p>}
            <button type="submit" disabled={!title.trim()}>Start</button>
          </form>
        )}
        {items.length > 0 && (
          <ol className="studio-items">
            {[...items].reverse().map(item => (
              <li key={item.n}>
                <button
                  type="button"
                  className={`studio-step${item.n === current ? ' current' : ''} ${item.status}`}
                  aria-current={item.n === current ? 'step' : undefined}
                  onClick={() => onSelect(item.n)}
                >
                  <span className="studio-step-mark" aria-hidden="true">{item.kind === 'prepare' ? '✎' : '⌛'}</span>
                  <span className="studio-step-title">
                    {item.title}
                    <span className="studio-step-usage">{item.kind === 'prepare' ? 'Prepare' : 'Interlude'} · {ITEM_STATUS[item.status]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </nav>
  );
}
