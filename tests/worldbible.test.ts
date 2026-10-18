import { describe, expect, it } from 'vitest';
import {
  addDeviation,
  getField,
  getSections,
  replaceSections,
  setField,
  WORLD_BIBLE_HEADINGS,
} from '../src/app/utils/worldbible';

const TEMPLATE = `---
type: world-bible
tags: [lore, style, canon]
last_updated: setup
---

# World Bible — Lore and Conventions

> Foundational world truths.

## Campaign
- **Name**: (the campaign's name)
- **Output language**: (the language the agent writes the wiki in)
- **Starting level**: (e.g. 1)
- **Rules edition**: (SRD 5.1 | SRD 5.2.1 | none)
- **Start date in the world**: (e.g. 1492-Kythorn-10)

## Setting
- **World**: (Homebrew | Published: <name> | Mixed: <name> + homebrew)
- **Sources**: (books and adventures you use)
- **Deviations from the published canon**:
  - (one per line; they win over published lore)

## Tone and Atmosphere
- (e.g. dark fantasy)

## Lore Pillars (immutable truths)
- (e.g. the gods never intervene)

## Naming Conventions
- (e.g. hard consonants)

## Basic Geography
- (e.g. continents)

## Cosmology
- (e.g. planes)

## Things that do NOT exist in this world
- (e.g. no firearms)

## Style notes for the agent
- (e.g. one mannerism per NPC)
`;

// Hand-edited: a custom section between contract ones, extra blank lines, no Cosmology
const HAND = `# World Bible

## Tone and Atmosphere
- Grim and political.


## Factions overview
- My own notes, keep me.

## Lore Pillars (immutable truths)
- No resurrection.

## Basic Geography
- One continent.

## Things that do NOT exist in this world
- No elves.
`;

describe('world-bible sections', () => {
  it('lists the contract headings in order', () => {
    expect(WORLD_BIBLE_HEADINGS[0]).toBe('Campaign');
    expect(WORLD_BIBLE_HEADINGS).toHaveLength(9);
  });

  it('reads existing sections and returns empty for missing ones', () => {
    const s = getSections(HAND, ['Tone and Atmosphere', 'Cosmology']);
    expect(s['Tone and Atmosphere']).toBe('- Grim and political.\n\n\n');
    expect(s['Cosmology']).toBe('');
  });

  it('replaces only the given sections and keeps every other byte', () => {
    const out = replaceSections(HAND, { 'Tone and Atmosphere': '- Hopeful.\n\n' });
    expect(out).toBe(HAND.replace('- Grim and political.\n\n\n', '- Hopeful.\n\n'));
    expect(out).toContain('## Factions overview\n- My own notes, keep me.\n');
  });

  it('inserts a missing contract heading at its contract position', () => {
    const out = replaceSections(HAND, { Cosmology: '- Seven planes.\n\n' });
    const geo = out.indexOf('## Basic Geography');
    const cos = out.indexOf('## Cosmology');
    const things = out.indexOf('## Things that do NOT exist in this world');
    expect(geo).toBeLessThan(cos);
    expect(cos).toBeLessThan(things);
    expect(getSections(out, ['Cosmology']).Cosmology).toBe('- Seven planes.\n\n');
    expect(out.startsWith(HAND.slice(0, HAND.indexOf('## Things')))).toBe(true);
  });

  it('keeps CRLF line endings', () => {
    const crlf = HAND.replace(/\n/g, '\r\n');
    const out = replaceSections(crlf, { 'Lore Pillars (immutable truths)': '- Death is final.\n' });
    expect(out).toContain('## Lore Pillars (immutable truths)\r\n- Death is final.\r\n');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('world-bible fields', () => {
  it('reads a field', () => {
    expect(getField(TEMPLATE, 'Campaign', 'Name')).toBe("(the campaign's name)");
    expect(getField(TEMPLATE, 'Setting', 'Missing')).toBeNull();
  });

  it('sets an existing field and leaves the rest', () => {
    const out = setField(TEMPLATE, 'Campaign', 'Rules edition', 'SRD 5.2.1');
    expect(getField(out, 'Campaign', 'Rules edition')).toBe('SRD 5.2.1');
    expect(getField(out, 'Campaign', 'Name')).toBe("(the campaign's name)");
  });

  it('adds a missing field at the end of its section', () => {
    const md = TEMPLATE.replace("- **Starting level**: (e.g. 1)\n", '');
    const out = setField(md, 'Campaign', 'Starting level', '3');
    expect(getField(out, 'Campaign', 'Starting level')).toBe('3');
    expect(out.indexOf('**Starting level**')).toBeLessThan(out.indexOf('## Setting'));
  });

  it('adds deviations, replacing the placeholder first', () => {
    const once = addDeviation(TEMPLATE, 'Elminster is dead.');
    expect(once).toContain('- **Deviations from the published canon**:\n  - Elminster is dead.\n');
    expect(once).not.toContain('(one per line');
    const twice = addDeviation(once, 'No Spellplague.');
    expect(twice).toContain('  - Elminster is dead.\n  - No Spellplague.\n');
  });
});
