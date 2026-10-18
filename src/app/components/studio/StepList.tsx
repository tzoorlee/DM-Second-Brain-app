import type { StepSummary } from './api';

const MARK = { todo: '○', 'in-progress': '●', approved: '✓' } as const;

interface StepListProps {
  steps: StepSummary[];
  current: number;
  onSelect: (n: number) => void;
}

export default function StepList({ steps, current, onSelect }: StepListProps) {
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
                {step.usage.input + step.usage.output > 0 && (
                  <span className="studio-step-usage">
                    {step.usage.input.toLocaleString()} in · {step.usage.output.toLocaleString()} out tokens
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="studio-later">
        <button type="button" disabled>+ Prepare</button>
        <button type="button" disabled>+ Interlude</button>
        <p>After your first session: coming soon.</p>
      </div>
    </nav>
  );
}
