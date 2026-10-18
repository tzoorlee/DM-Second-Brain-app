import MiniSearch from 'minisearch';
import { Entity, getAllEntities, getCampaignRoot, isPlayerVisible, listWikiFiles, splitDmSecrets } from './wiki';

export type SearchMode = 'dm' | 'player';

export interface SearchFilters {
  type?: string;
  canonStatus?: string;
  status?: string;
}

export interface EntitySummary {
  title: string;
  relativePath: string;
  frontmatter: Entity['frontmatter'];
}

interface IndexedPage {
  id: string;
  title: string;
  tags: string;
  body: string;
  secrets: string;
}

// Case- and accent-insensitive, so "tomas" finds "Tomás".
function normalizeTerm(term: string): string {
  return term.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function buildIndex(entities: Entity[]): MiniSearch<IndexedPage> {
  const index = new MiniSearch<IndexedPage>({
    fields: ['title', 'tags', 'body', 'secrets'],
    processTerm: normalizeTerm,
  });
  index.addAll(
    entities.map(entity => {
      const { publicBody, dmBody } = splitDmSecrets(entity.body);
      return {
        id: entity.relativePath,
        title: entity.title,
        tags: (entity.frontmatter.tags ?? []).join(' '),
        body: publicBody,
        secrets: dmBody,
      };
    })
  );
  return index;
}

// The index is rebuilt only when a wiki file is added, removed or modified.
let cache: { key: string; entities: Map<string, Entity>; index: MiniSearch<IndexedPage> } | null = null;

function getIndex() {
  const files = listWikiFiles();
  const key = getCampaignRoot() + '\n' + files.map(f => `${f.relativePath}:${f.mtimeMs}`).join('\n');
  if (cache?.key !== key) {
    const entities = getAllEntities(files);
    cache = {
      key,
      entities: new Map(entities.map(entity => [entity.relativePath, entity])),
      index: buildIndex(entities),
    };
  }
  return cache;
}

function matchesFilters(entity: Entity, mode: SearchMode, filters: SearchFilters): boolean {
  const fm = entity.frontmatter;
  if (mode === 'player' && !isPlayerVisible(entity)) return false;
  if (filters.type && fm.type?.toLowerCase() !== filters.type) return false;
  if (filters.canonStatus && fm.canon_status?.toLowerCase() !== filters.canonStatus) return false;
  if (filters.status && fm.status?.toLowerCase() !== filters.status) return false;
  return true;
}

function toSummary({ title, relativePath, frontmatter }: Entity): EntitySummary {
  return { title, relativePath, frontmatter };
}

// Ranked full-text search over the wiki. An empty query lists every matching
// page alphabetically. In player mode, DM-only text is never searched and
// pages the PCs don't know about are left out.
export function searchEntities(query: string, mode: SearchMode, filters: SearchFilters = {}): EntitySummary[] {
  const { entities, index } = getIndex();
  const keep = (entity: Entity | undefined): entity is Entity =>
    entity !== undefined && matchesFilters(entity, mode, filters);

  if (!query.trim()) {
    return [...entities.values()]
      .filter(keep)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(toSummary);
  }

  const results = index.search(query, {
    fields: mode === 'dm' ? ['title', 'tags', 'body', 'secrets'] : ['title', 'tags', 'body'],
    boost: { title: 3, tags: 2 },
    prefix: true,
    fuzzy: term => (term.length > 3 ? 0.2 : false),
    combineWith: 'AND',
  });

  return results
    .map(result => entities.get(result.id))
    .filter(keep)
    .map(toSummary);
}
