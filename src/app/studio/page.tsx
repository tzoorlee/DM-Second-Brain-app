'use client';

import Link from 'next/link';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import DraftPanel from '../components/studio/DraftPanel';
import SrdStep from '../components/studio/SrdStep';
import StepList from '../components/studio/StepList';
import StudioChat from '../components/studio/StudioChat';
import SummaryStep from '../components/studio/SummaryStep';
import { StepWithDraft, StudioOverview, studioApi } from '../components/studio/api';

type Tab = 'steps' | 'chat' | 'draft';

const FILE_LABELS: Record<string, string> = {
  worldbible: 'raw/world-bible.md',
  worldbuilding: 'raw/worldbuilding/',
};

export default function StudioPage() {
  const [overview, setOverview] = useState<StudioOverview | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [step, setStep] = useState<StepWithDraft | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [error, setError] = useState('');

  const refresh = useCallback(async (n?: number) => {
    try {
      const next = await studioApi.overview();
      setOverview(next);
      const target = n ?? current ?? next.steps.find(s => s.status !== 'approved')?.n ?? 1;
      setCurrent(target);
      setStep(await studioApi.step(target));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [current]);

  // Open the step in the URL (?step=4), or the first one not approved yet
  useEffect(() => {
    const load = async () => {
      const fromUrl = Number(new URLSearchParams(window.location.search).get('step')) || undefined;
      await refresh(fromUrl);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (n: number) => {
    setStep(null);
    refresh(n);
    setTab('chat');
    window.history.replaceState(null, '', `/studio?step=${n}`);
  };

  if (error) {
    return (
      <main className="setup-screen">
        <div className="setup-card glass">
          <h1>World Studio</h1>
          <div className="setup-problem" role="alert">{error}</div>
          <Link href="/">Back to the dashboard</Link>
        </div>
      </main>
    );
  }
  if (!overview || current === null) return null;

  const info = overview.steps.find(s => s.n === current)!;
  const fileLabel = info.kind === 'file' ? (current === 5 ? 'raw/house-rules.md' : 'raw/worldbuilding/starting-point.md') : FILE_LABELS[info.kind] ?? '';

  let right: ReactNode = null;
  if (info.kind === 'srd') right = <SrdStep current={overview.rulesEdition} onChanged={() => refresh()} />;
  else if (info.kind === 'summary') right = <SummaryStep overview={overview} onChanged={() => refresh()} />;
  else if (step) right = <DraftPanel key={step.n} step={step} title={`${current}. ${info.title}`} fileLabel={fileLabel} onChanged={() => refresh()} />;

  return (
    <div className={`studio tab-${tab}`}>
      <header className="studio-header glass">
        <Link href="/" className="studio-back">← Dashboard</Link>
        <h1>World Studio</h1>
        <span className="studio-model">{overview.aiAvailable ? `AI: ${overview.model}` : 'AI not available'}</span>
      </header>
      <nav className="studio-tabs glass" aria-label="Panels">
        {(['steps', 'chat', 'draft'] as const).map(t => (
          <button key={t} type="button" className={tab === t ? undefined : 'secondary'} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'steps' ? 'Steps' : t === 'chat' ? 'Chat' : 'Draft'}
          </button>
        ))}
      </nav>
      <div className="studio-col studio-col-steps glass">
        <StepList steps={overview.steps} current={current} onSelect={select} />
      </div>
      <div className="studio-col studio-col-chat glass">
        {step && info.kind !== 'srd' ? (
          <StudioChat step={step} aiAvailable={overview.aiAvailable} published={overview.published} onChanged={() => refresh()} onOpenStep={select} />
        ) : (
          <p className="studio-nochat">{info.kind === 'srd' ? 'This step needs no chat: choose on the right.' : ''}</p>
        )}
      </div>
      <div className="studio-col studio-col-draft glass">{right}</div>
    </div>
  );
}
