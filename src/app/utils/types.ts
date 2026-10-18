// Display names and colors of the page types listed in the template's TEMPLATES.md

export const TYPE_LABELS: Record<string, string> = {
  world: 'World',
  adventure: 'Adventures',
  pc: 'Player Characters',
  npc: 'NPCs',
  region: 'Regions',
  'region-history': 'Region Histories',
  city: 'Cities',
  'city-history': 'City Histories',
  location: 'Places',
  dungeon: 'Dungeons',
  faction: 'Factions',
  'faction-history': 'Faction Histories',
  deity: 'Deities',
  creature: 'Creatures',
  quest: 'Quests',
  item: 'Items',
  event: 'Events',
  lore: 'Lore',
  secret: 'Secrets',
};

const TYPE_COLORS: Record<string, string> = {
  npc: 'var(--accent-purple)',
  pc: 'var(--accent-teal)',
  city: '#ca8a04',
  region: '#65a30d',
  location: '#ea580c',
  dungeon: '#dc2626',
  faction: '#2563eb',
  quest: '#e11d48',
  item: '#d97706',
  event: '#0891b2',
  secret: '#db2777',
  world: '#475569',
  adventure: '#c026d3',
  deity: '#f59e0b',
  creature: '#16a34a',
  lore: '#7c3aed',
};

// "city-history" pages share their entity's color
export const getTypeColor = (type?: string) =>
  TYPE_COLORS[type?.toLowerCase().replace(/-history$/, '') ?? ''] ?? 'var(--text-muted)';

export const typeLabel = (type?: string) => (type ? TYPE_LABELS[type] ?? type : 'Other');

export const getStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'alive':
    case 'active':
      return 'var(--success)';
    case 'dead':
    case 'destroyed':
    case 'failed':
    case 'extinct':
      return 'var(--danger)';
    case 'completed':
    case 'cleared':
    case 'revealed':
      return '#60a5fa';
    case 'pending':
    case 'hidden':
      return 'var(--text-muted)';
    default:
      return 'var(--warning)';
  }
};
