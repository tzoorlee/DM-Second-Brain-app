'use client';

import { SourceInfo } from './api';

const MARKS: Record<SourceInfo['status'], string> = { 'not-ingested': '○', 'in-progress': '◐', ingested: '✓', 'invalid-name': '!' };
const LABELS: Record<SourceInfo['status'], string> = {
  'not-ingested': 'Not ingested',
  'in-progress': 'In progress',
  ingested: 'Ingested',
  'invalid-name': 'Rename to YYYY-MM-DD-<slug>.md',
};

interface SourceListProps {
  sources: SourceInfo[];
  current: string | null;
  onSelect: (id: string) => void;
}

function Group({ title, sources, current, onSelect, empty }: SourceListProps & { title: string; empty: string }) {
  return (
    <>
      <h2>{title}</h2>
      {sources.length === 0 ? (
        <p className="studio-step-usage">{empty}</p>
      ) : (
        <ol>
          {sources.map(s => (
            <li key={s.id}>
              <button
                type="button"
                className={`studio-step ${s.status === 'ingested' ? 'approved' : s.status}${s.id === current ? ' current' : ''}`}
                aria-current={s.id === current ? 'step' : undefined}
                onClick={() => onSelect(s.id)}
                disabled={s.status === 'invalid-name'}
              >
                <span className="studio-step-mark" aria-hidden="true">{MARKS[s.status]}</span>
                <span className="studio-step-title">
                  {s.title}
                  <span className="studio-step-usage">{LABELS[s.status]}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

// Sessions and design material, each its own queue
export default function SourceList({ sources, current, onSelect }: SourceListProps) {
  return (
    <nav className="studio-steps" aria-label="What to ingest">
      <Group
        title="Sessions"
        sources={sources.filter(s => s.kind === 'session')}
        current={current}
        onSelect={onSelect}
        empty="No recaps in raw/sessions/ yet. Save one from the dashboard."
      />
      <Group
        title="Design"
        sources={sources.filter(s => s.kind !== 'session')}
        current={current}
        onSelect={onSelect}
        empty="No design files in raw/worldbuilding/ yet. Write them in the World Studio."
      />
    </nav>
  );
}
