'use client';

import { useState } from 'react';
import { studioApi } from './api';

const OPTIONS = [
  { value: '5.1', label: 'D&D 2014 rules — SRD 5.1' },
  { value: '5.2.1', label: 'D&D 2024 rules — SRD 5.2.1' },
  { value: 'none', label: 'None: we play another system or use our books only' },
];

// Step 6: no chat; choose an edition and the app downloads it into raw/srd/
export default function SrdStep({ current, onChanged }: { current: string | null; onChanged: () => void }) {
  const [edition, setEdition] = useState(current?.replace(/^SRD /, '') ?? '5.1');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { files } = await studioApi.srd(edition);
      setResult({ ok: true, message: edition === 'none' ? 'Recorded: no SRD.' : `Downloaded ${files.toLocaleString()} files into raw/srd/.` });
      onChanged();
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    }
    setBusy(false);
  };

  return (
    <section className="studio-draft studio-srd" aria-label="Rules reference">
      <header className="studio-draft-header">
        <h2>Rules reference (SRD)</h2>
        <span className="studio-draft-file">raw/srd/</span>
      </header>
      <p>
        The System Reference Document holds monsters, spells and rules under CC-BY-4.0. The agent uses it as system rules,
        separate from your world. {current && !current.startsWith('(') && <>Now: <strong>{current}</strong>.</>}
      </p>
      <fieldset className="studio-checklist">
        <legend>Which rules do you play?</legend>
        {OPTIONS.map(o => (
          <label key={o.value}>
            <input type="radio" name="srd" value={o.value} checked={edition === o.value} onChange={() => setEdition(o.value)} />
            {o.label}
          </label>
        ))}
      </fieldset>
      <div className="studio-approve">
        {result && <p className={`studio-result ${result.ok ? 'ok' : 'error'}`} role="status">{result.message}</p>}
        <button type="button" onClick={run} disabled={busy}>
          {busy ? 'Downloading…' : edition === 'none' ? 'Save choice' : 'Download'}
        </button>
      </div>
    </section>
  );
}
