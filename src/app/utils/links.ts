import path from 'path';
import { Entity, isPlayerVisible, splitDmSecrets } from './wiki';

export type LinkMode = 'dm' | 'player';

// Frontmatter fields that point to other pages (see the template's TEMPLATES.md).
// city_page is the old name of subject.
export const LINK_FIELDS = [
  'location', 'region', 'faction', 'owner', 'deity', 'giver', 'adventure',
  'requires', 'about', 'subject', 'city_page', 'history_page',
] as const;

export interface LinkTarget {
  slug: string;
  title: string;
  relativePath: string;
  type?: string;
  status?: string;
}

export interface LinkedFrom {
  title: string;
  relativePath: string;
  type?: string;
  status?: string;
  // The link field that points here, or 'text' for a link in the page's text
  via: string;
}

export interface EntityLinks {
  fields: { field: string; targets: LinkTarget[] }[];
  linkedFrom: LinkedFrom[];
  // Quests whose `requires` lists this quest
  unlocks: LinkTarget[];
}

export const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

const slugOf = (entity: Entity) => path.basename(entity.relativePath, '.md');

// The link targets written in a frontmatter value or a text: "[[a]]", ["[[a]]", "[[b|B]]"]
function targetsIn(value: unknown): string[] {
  const texts = Array.isArray(value) ? value : value ? [value] : [];
  return texts.flatMap(text => [...String(text).matchAll(WIKILINK)].map(m => m[1].trim()));
}

// A page matches a link by file name ("elder-maren") or, in older campaigns, by title
function makeResolver(entities: Iterable<Entity>) {
  const bySlug = new Map<string, Entity>();
  const byTitle = new Map<string, Entity>();
  for (const entity of entities) {
    bySlug.set(slugOf(entity), entity);
    byTitle.set(entity.title.toLowerCase(), entity);
  }
  return (target: string): Entity | undefined => {
    const clean = target.toLowerCase();
    return bySlug.get(clean.replace(/\s+/g, '-')) ?? byTitle.get(clean);
  };
}

const toTarget = (entity: Entity): LinkTarget => ({
  slug: slugOf(entity),
  title: entity.title,
  relativePath: entity.relativePath,
  type: entity.frontmatter.type,
  status: entity.frontmatter.status,
});

// The link fields of a page, who links to it, and which quests it unlocks. In
// Player Safe, hidden pages are left out on both sides and links inside the
// DM-only section don't count, so nothing here reveals a hidden page.
export function getEntityLinks(entity: Entity, all: Entity[], mode: LinkMode): EntityLinks {
  const visible = (e: Entity) => mode === 'dm' || isPlayerVisible(e);
  const resolve = makeResolver(all);
  const resolveVisible = (target: string) => {
    const found = resolve(target);
    return found && visible(found) ? found : undefined;
  };

  const fields = LINK_FIELDS.map(field => ({
    field,
    targets: targetsIn(entity.frontmatter[field])
      .map(resolveVisible)
      .filter((e): e is Entity => e !== undefined)
      .map(toTarget),
  })).filter(f => f.targets.length > 0);

  const isThis = (target: string) => resolve(target)?.relativePath === entity.relativePath;
  const linkedFrom: LinkedFrom[] = [];
  const unlocks: LinkTarget[] = [];
  for (const source of all) {
    if (source.relativePath === entity.relativePath || !visible(source)) continue;
    const field = LINK_FIELDS.find(f => targetsIn(source.frontmatter[f]).some(isThis));
    const text = mode === 'dm' ? source.body : splitDmSecrets(source.body).publicBody;
    const via = field ?? (targetsIn(text).some(isThis) ? 'text' : undefined);
    if (via) {
      linkedFrom.push({
        title: source.title,
        relativePath: source.relativePath,
        type: source.frontmatter.type,
        status: source.frontmatter.status,
        via,
      });
    }
    if (source.frontmatter.type === 'quest' && targetsIn(source.frontmatter.requires).some(isThis)) {
      unlocks.push(toTarget(source));
    }
  }

  const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
  return { fields, linkedFrom: linkedFrom.sort(byTitle), unlocks: unlocks.sort(byTitle) };
}
