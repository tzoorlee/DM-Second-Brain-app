import type { EntityLinks, LinkTarget } from '../utils/links';

// Labels for the link fields shown under the title. `requires` has its own box
// (EntityRelations), and city_page is the old name of subject.
const LINK_LABELS: Record<string, string> = {
  location: 'Location',
  region: 'Region',
  faction: 'Faction',
  owner: 'Owner',
  deity: 'Deity',
  giver: 'Given by',
  adventure: 'Adventure',
  about: 'About',
  subject: 'Chronology of',
  city_page: 'Chronology of',
  history_page: 'Chronology',
};

const PLAIN_LABELS: Record<string, string> = {
  player: 'Player',
  domains: 'Domains',
  symbol: 'Symbol',
  srd: 'SRD',
  date_in_world: 'Date',
  session: 'Session',
  first_seen: 'First seen',
  last_updated: 'Updated',
};

interface EntityFactsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frontmatter: Record<string, any>;
  links?: EntityLinks;
  onOpenLink: (relativePath: string) => void;
}

export function TargetLinks({ targets, onOpenLink }: { targets: LinkTarget[]; onOpenLink: (relativePath: string) => void }) {
  return (
    <>
      {targets.map((target, i) => (
        <span key={target.relativePath}>
          {i > 0 && ', '}
          <button type="button" className="wikilink" onClick={() => onOpenLink(target.relativePath)}>
            {target.title}
          </button>
        </span>
      ))}
    </>
  );
}

// The page's link fields, by title, and its plain fields. Empty ones are left out.
export default function EntityFacts({ frontmatter, links, onOpenLink }: EntityFactsProps) {
  const fields = (links?.fields ?? []).filter(f => f.field in LINK_LABELS);
  const plain = Object.entries(PLAIN_LABELS)
    .map(([field, label]) => {
      const value = frontmatter[field];
      const text = Array.isArray(value) ? value.join(', ') : value === undefined || value === null ? '' : String(value);
      return { field, label, text: text.trim() };
    })
    .filter(p => p.text);

  if (fields.length === 0 && plain.length === 0) return null;
  return (
    <div className="entity-facts">
      {fields.map(({ field, targets }) => (
        <span key={field}>
          {LINK_LABELS[field]}: <TargetLinks targets={targets} onOpenLink={onOpenLink} />
        </span>
      ))}
      {plain.map(({ field, label, text }) => (
        <span key={field}>
          {label}: {text}
        </span>
      ))}
    </div>
  );
}
