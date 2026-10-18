// Step 5: common house rules. Checking one adds its line to the draft's
// "## Table variants" section; unchecking removes it.

const VARIANTS = [
  'Critical hits deal maximum damage for the dice plus a normal roll.',
  'A short rest takes 1 hour.',
  'Lingering injuries on a critical hit or when dropping to 0 hit points.',
  'Flanking gives advantage on melee attacks.',
  'Drinking a potion is a bonus action; giving one to another creature is an action.',
  'Ability scores by 27-point buy.',
  'Every character gets a feat at level 1.',
  'Slow natural healing: hit dice only, no hit points back on a long rest.',
];

const HEADING = '## Table variants';

function toggle(draft: string, line: string, on: boolean): string {
  const item = `- ${line}`;
  const lines = draft.split('\n');
  if (!on) return lines.filter(l => l !== item).join('\n');
  let at = lines.findIndex(l => l.trim() === HEADING);
  if (at === -1) {
    const base = draft.trim() ? draft.replace(/\n*$/, '\n\n') : '# House Rules\n\n';
    return `${base}${HEADING}\n${item}\n`;
  }
  at++;
  while (at < lines.length && lines[at].startsWith('- ')) at++;
  lines.splice(at, 0, item);
  return lines.join('\n');
}

export default function RulesChecklist({ draft, onChange }: { draft: string; onChange: (draft: string) => void }) {
  const has = (line: string) => draft.split('\n').includes(`- ${line}`);
  return (
    <fieldset className="studio-checklist">
      <legend>Common variants</legend>
      {VARIANTS.map(v => (
        <label key={v}>
          <input type="checkbox" checked={has(v)} onChange={e => onChange(toggle(draft, v, e.target.checked))} />
          {v}
        </label>
      ))}
    </fieldset>
  );
}
