import type { EntityLinks, LinkTarget } from '../utils/links';
import { getStatusColor, typeLabel } from '../utils/types';

interface EntityRelationsProps {
  type?: string;
  links?: EntityLinks;
  onOpenLink: (relativePath: string) => void;
}

function StatusList({ items, onOpenLink }: { items: (LinkTarget | { title: string; relativePath: string; status?: string })[]; onOpenLink: (p: string) => void }) {
  return (
    <ul className="relation-list">
      {items.map(item => (
        <li key={item.relativePath}>
          <span className="relation-mark" style={{ color: getStatusColor(item.status) }} aria-hidden="true">
            {item.status === 'completed' ? '✓' : '•'}
          </span>
          <button type="button" className="wikilink" onClick={() => onOpenLink(item.relativePath)}>
            {item.title}
          </button>
          {item.status && (
            <span className="relation-status" style={{ color: getStatusColor(item.status) }}>
              {item.status}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// Below the page text: a quest's dependencies, an adventure's quests, and every
// page that links here. All of it comes from the server, already filtered for
// Player Safe.
export default function EntityRelations({ type, links, onOpenLink }: EntityRelationsProps) {
  if (!links) return null;
  const requires = links.fields.find(f => f.field === 'requires')?.targets ?? [];
  const adventureQuests = type === 'adventure' ? links.linkedFrom.filter(l => l.via === 'adventure' && l.type === 'quest') : [];

  // Group "Linked from" by the type of the linking page, leaving out the quests
  // already shown in the adventure's Quests box
  const groups = new Map<string, typeof links.linkedFrom>();
  for (const link of links.linkedFrom.filter(l => !adventureQuests.includes(l))) {
    const label = typeLabel(link.type);
    groups.set(label, [...(groups.get(label) ?? []), link]);
  }

  return (
    <div className="entity-relations">
      {(requires.length > 0 || links.unlocks.length > 0) && (
        <section className="relation-box" aria-label="Dependencies">
          <h3>Dependencies</h3>
          {requires.length > 0 && (
            <>
              <h4>Requires</h4>
              <StatusList items={requires} onOpenLink={onOpenLink} />
            </>
          )}
          {links.unlocks.length > 0 && (
            <>
              <h4>Unlocks</h4>
              <StatusList items={links.unlocks} onOpenLink={onOpenLink} />
            </>
          )}
        </section>
      )}

      {adventureQuests.length > 0 && (
        <section className="relation-box" aria-label="Quests in this adventure">
          <h3>Quests</h3>
          <StatusList items={adventureQuests} onOpenLink={onOpenLink} />
        </section>
      )}

      {groups.size > 0 && (
        <section className="relation-box" aria-label="Linked from">
          <h3>Linked from</h3>
          {[...groups.entries()].map(([label, items]) => (
            <div key={label} className="relation-group">
              <h4>{label}</h4>
              <ul className="relation-list">
                {items.map(item => (
                  <li key={item.relativePath}>
                    <button type="button" className="wikilink" onClick={() => onOpenLink(item.relativePath)}>
                      {item.title}
                    </button>
                    <span className="relation-via">{item.via === 'text' ? 'mentions it' : `as ${item.via.replace('_', ' ')}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
