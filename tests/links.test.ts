import { beforeEach, describe, expect, it } from 'vitest';
import { getEntity } from '../src/app/utils/search';
import { isolateEnv, makeCampaign, makeTempDir, writePage } from './helpers';

const base = { tags: [], canon_status: 'established', first_seen: 'session-01', last_updated: 'session-01', pg_known: true };

function vault() {
  const root = makeCampaign(makeTempDir(), 'test');
  writePage(root, 'locations/cities/silverbrook.md', { type: 'city', status: 'active', ...base, region: '' },
    '# Silverbrook\n\n## Resident NPCs\n- [[maren|Maren]]\n\n## Secrets (DM only)\n- [[cult|The Cult]] hides here');
  writePage(root, 'characters/npcs/maren.md', { type: 'npc', status: 'alive', ...base, location: '[[silverbrook]]', faction: '[[cult]]' },
    '# Maren\n\nLives in [[Silverbrook]].\n\n## Secrets (DM only)\n- serves [[cult|the Cult]]');
  writePage(root, 'locations/places/kettle.md', { type: 'location', status: 'active', ...base, location: '[[silverbrook]]', owner: [] },
    '# The Kettle\n\nA tavern in [[silverbrook]].');
  writePage(root, 'factions/cult.md', { type: 'faction', status: 'active', ...base, pg_known: false, location: '[[silverbrook]]' },
    '# The Cult\n\nBased in [[silverbrook|Silverbrook]].');
  writePage(root, 'quests/active/first.md', { type: 'quest', status: 'completed', ...base, requires: [], adventure: '[[arc]]' }, '# First Quest');
  writePage(root, 'quests/active/second.md', { type: 'quest', status: 'pending', ...base, requires: ['[[first]]'], adventure: '[[arc]]', giver: '[[maren]]' }, '# Second Quest');
  writePage(root, 'adventures/arc.md', { type: 'adventure', status: 'active', ...base }, '# The Arc');
  process.env.VAULT_PATH = root;
  return root;
}

const field = (page: ReturnType<typeof getEntity>, name: string) => page?.links.fields.find(f => f.field === name);

describe('entity links', () => {
  isolateEnv();
  beforeEach(() => {
    vault();
  });

  it('resolves link fields to the target page', () => {
    const maren = getEntity('characters/npcs/maren.md', 'dm');
    expect(field(maren, 'location')?.targets).toEqual([
      { slug: 'silverbrook', title: 'Silverbrook', relativePath: 'locations/cities/silverbrook.md', type: 'city', status: 'active' },
    ]);
  });

  it('leaves empty link fields out', () => {
    const kettle = getEntity('locations/places/kettle.md', 'dm');
    expect(kettle?.links.fields.map(f => f.field)).toEqual(['location']);
  });

  it('keeps a link field to a hidden page in DM view only', () => {
    expect(field(getEntity('characters/npcs/maren.md', 'dm'), 'faction')?.targets[0].title).toBe('The Cult');
    expect(field(getEntity('characters/npcs/maren.md', 'player'), 'faction')).toBeUndefined();
  });

  it('lists the pages that link here, from fields and from the text', () => {
    const city = getEntity('locations/cities/silverbrook.md', 'dm');
    expect(city?.links.linkedFrom.map(l => `${l.relativePath}:${l.via}`).sort()).toEqual([
      'characters/npcs/maren.md:location',
      'factions/cult.md:location',
      'locations/places/kettle.md:location',
    ]);
  });

  it('Player Safe leaves out hidden pages and links inside DM secrets', () => {
    const city = getEntity('locations/cities/silverbrook.md', 'player');
    expect(city?.links.linkedFrom.map(l => l.relativePath).sort()).toEqual(['characters/npcs/maren.md', 'locations/places/kettle.md']);
    const cultInDm = getEntity('factions/cult.md', 'dm');
    expect(cultInDm?.links.linkedFrom.map(l => `${l.relativePath}:${l.via}`).sort()).toEqual([
      'characters/npcs/maren.md:faction',
      'locations/cities/silverbrook.md:text',
    ]);
  });

  it('requires carries the status of each required quest', () => {
    const second = getEntity('quests/active/second.md', 'dm');
    expect(field(second, 'requires')?.targets).toEqual([
      { slug: 'first', title: 'First Quest', relativePath: 'quests/active/first.md', type: 'quest', status: 'completed' },
    ]);
  });

  it('a quest lists the quests it unlocks', () => {
    const first = getEntity('quests/active/first.md', 'dm');
    expect(first?.links.unlocks).toEqual([
      { slug: 'second', title: 'Second Quest', relativePath: 'quests/active/second.md', type: 'quest', status: 'pending' },
    ]);
  });

  it('an adventure is linked from its quests', () => {
    const arc = getEntity('adventures/arc.md', 'dm');
    expect(arc?.links.linkedFrom.filter(l => l.via === 'adventure').map(l => [l.title, l.status])).toEqual([
      ['First Quest', 'completed'],
      ['Second Quest', 'pending'],
    ]);
  });
});
