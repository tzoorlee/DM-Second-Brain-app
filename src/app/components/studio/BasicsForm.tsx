import { draftField, withDraftField } from './api';

// Step 1: the Campaign and Setting fields as a form; it edits the draft's lines
export default function BasicsForm({ draft, onChange }: { draft: string; onChange: (draft: string) => void }) {
  const world = draftField(draft, 'World');
  const kind = /^Published/i.test(world) ? 'published' : /^Mixed/i.test(world) ? 'mixed' : world && !world.startsWith('(') ? 'homebrew' : '';
  const settingName = world.replace(/^(Published|Mixed):\s*/i, '').replace(/\s*\+\s*homebrew$/i, '');
  const value = (label: string) => {
    const v = draftField(draft, label);
    return v.startsWith('(') ? '' : v;
  };

  const set = (heading: string, label: string) => (v: string) => onChange(withDraftField(draft, heading, label, v));
  const setWorld = (nextKind: string, name: string) =>
    onChange(
      withDraftField(draft, 'Setting', 'World', nextKind === 'published' ? `Published: ${name}` : nextKind === 'mixed' ? `Mixed: ${name} + homebrew` : 'Homebrew'),
    );

  return (
    <div className="studio-form">
      <label>
        Campaign name
        <input value={value('Name')} onChange={e => set('Campaign', 'Name')(e.target.value)} />
      </label>
      <label>
        Language of the wiki
        <input value={value('Output language')} onChange={e => set('Campaign', 'Output language')(e.target.value)} placeholder="English" />
      </label>
      <label>
        Starting level
        <input value={value('Starting level')} onChange={e => set('Campaign', 'Starting level')(e.target.value)} placeholder="1" />
      </label>
      <label>
        Start date in the world
        <input value={value('Start date in the world')} onChange={e => set('Campaign', 'Start date in the world')(e.target.value)} placeholder="1492-Kythorn-10" />
      </label>
      <label>
        World
        <select value={kind} onChange={e => setWorld(e.target.value, settingName)}>
          <option value="" disabled>Choose…</option>
          <option value="homebrew">My own world (homebrew)</option>
          <option value="published">A published setting</option>
          <option value="mixed">A published setting with my additions</option>
        </select>
      </label>
      {(kind === 'published' || kind === 'mixed') && (
        <>
          <label>
            Setting
            <input value={settingName} onChange={e => setWorld(kind, e.target.value)} placeholder="Forgotten Realms, Sword Coast" />
          </label>
          <label>
            Sources
            <input value={value('Sources')} onChange={e => set('Setting', 'Sources')(e.target.value)} placeholder="Books and adventures you use" />
          </label>
        </>
      )}
    </div>
  );
}
