'use client';

import { SessionInfo } from './api';

const MARKS: Record<SessionInfo['status'], string> = { 'not-ingested': '○', 'in-progress': '◐', ingested: '✓' };
const LABELS: Record<SessionInfo['status'], string> = { 'not-ingested': 'Not ingested', 'in-progress': 'In progress', ingested: 'Ingested' };

interface SessionListProps {
  sessions: SessionInfo[];
  current: string | null;
  onSelect: (id: string) => void;
}

export default function SessionList({ sessions, current, onSelect }: SessionListProps) {
  return (
    <nav className="studio-steps" aria-label="Sessions">
      <h2>Sessions</h2>
      {sessions.length === 0 ? (
        <p className="studio-step-usage">No recaps in raw/sessions/ yet. Save one from the dashboard.</p>
      ) : (
        <ol>
          {sessions.map(s => (
            <li key={s.id}>
              <button
                type="button"
                className={`studio-step ${s.status === 'ingested' ? 'approved' : s.status}${s.id === current ? ' current' : ''}`}
                aria-current={s.id === current ? 'step' : undefined}
                onClick={() => onSelect(s.id)}
              >
                <span className="studio-step-mark" aria-hidden="true">{MARKS[s.status]}</span>
                <span className="studio-step-title">
                  Session {s.n}
                  <span className="studio-step-usage">{LABELS[s.status]}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
