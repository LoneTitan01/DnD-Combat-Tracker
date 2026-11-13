import { describe, expect, it } from 'vitest';
import type { Encounter } from '../models';
import {
  addToEncounter,
  allTags,
  blankEncounter,
  duplicateEncounter,
  encounterStats,
  encounterSummary,
  filterEncounters,
  groupByTag,
  parseTags,
  setEntryCount,
} from './encounter';

const templates = new Map([
  ['gob', { name: 'Goblin', xp: 50 }],
  ['owl', { name: 'Owlbear', xp: 700 }],
]);

const enc = (overrides: Partial<Encounter> = {}): Encounter => ({ ...blankEncounter(), ...overrides });

describe('entry counts', () => {
  it('adds a creature, then increments it', () => {
    let e = addToEncounter(enc(), 'gob');
    e = addToEncounter(e, 'gob');
    e = addToEncounter(e, 'owl');
    expect(e.entries).toEqual([
      { templateId: 'gob', count: 2 },
      { templateId: 'owl', count: 1 },
    ]);
  });

  it('removes a creature at 0 and keeps the others in order', () => {
    let e = enc({ entries: [{ templateId: 'gob', count: 3 }, { templateId: 'owl', count: 1 }] });
    e = setEntryCount(e, 'gob', 0);
    expect(e.entries).toEqual([{ templateId: 'owl', count: 1 }]);
  });

  it('clamps counts to 0–99', () => {
    expect(setEntryCount(enc(), 'gob', 500).entries[0]!.count).toBe(99);
    expect(addToEncounter(enc({ entries: [{ templateId: 'gob', count: 1 }] }), 'gob', -5).entries).toEqual([]);
  });
});

describe('encounterStats', () => {
  it('totals XP and applies the multiplier for the number of monsters', () => {
    const s = encounterStats(enc({ entries: [{ templateId: 'gob', count: 4 }] }), templates, [1, 1, 1, 1]);
    expect(s).toMatchObject({ monsterCount: 4, baseXP: 200, multiplier: 2, adjustedXP: 400, difficulty: 'deadly' });
  });

  it('mixes creatures', () => {
    const s = encounterStats(
      enc({ entries: [{ templateId: 'gob', count: 2 }, { templateId: 'owl', count: 1 }] }),
      templates,
      [3, 3, 3, 3],
    );
    // 800 base × 2 (3 monsters) = 1600; level 3 ×4 → hard 900, deadly 1600.
    expect(s).toMatchObject({ baseXP: 800, adjustedXP: 1600, difficulty: 'deadly' });
  });

  it('has no difficulty without party levels', () => {
    expect(encounterStats(enc({ entries: [{ templateId: 'owl', count: 1 }] }), templates, []).difficulty).toBeNull();
  });

  it('reports and ignores deleted stat blocks', () => {
    const s = encounterStats(
      enc({ entries: [{ templateId: 'gone', count: 2 }, { templateId: 'gob', count: 1 }] }),
      templates,
      [1],
    );
    expect(s).toMatchObject({ monsterCount: 1, baseXP: 50, missing: ['gone'] });
  });

  it('is empty for an empty encounter', () => {
    expect(encounterStats(enc(), templates, [1, 1])).toMatchObject({ monsterCount: 0, baseXP: 0, adjustedXP: 0, difficulty: 'trivial' });
  });
});

describe('encounterSummary', () => {
  it('lists counts and names', () => {
    const e = enc({ entries: [{ templateId: 'gob', count: 3 }, { templateId: 'owl', count: 1 }, { templateId: 'gone', count: 1 }] });
    expect(encounterSummary(e, templates)).toBe('3× Goblin, Owlbear');
  });
});

describe('duplicateEncounter', () => {
  it('copies entries and tags with a new id and unique name', () => {
    const e = enc({ name: 'Ambush', entries: [{ templateId: 'gob', count: 3 }], tags: ['Session 1'] });
    const d = duplicateEncounter(e, ['Ambush', 'Ambush (copy)']);
    expect(d.name).toBe('Ambush (copy 2)');
    expect(d.id).not.toBe(e.id);
    expect(d.entries).toEqual(e.entries);
    expect(d.entries).not.toBe(e.entries);
  });
});

describe('tags', () => {
  it('parses comma-separated tags, de-duplicating case-insensitively', () => {
    expect(parseTags(' Session 3, ambush,,  session  3 , Lost Mine ')).toEqual(['Session 3', 'ambush', 'Lost Mine']);
    expect(parseTags('')).toEqual([]);
  });

  const list = [
    enc({ name: 'Wolves', tags: ['Session 10'] }),
    enc({ name: 'Ambush', tags: ['Session 2', 'Goblins'] }),
    enc({ name: 'Boss', tags: ['session 2'] }),
    enc({ name: 'Random', tags: [] }),
  ];

  it('groups by tag with natural sort and untagged last', () => {
    expect(groupByTag(list).map((g) => [g.tag, g.encounters.map((e) => e.name)])).toEqual([
      ['Goblins', ['Ambush']],
      ['Session 2', ['Ambush', 'Boss']],
      ['Session 10', ['Wolves']],
      ['', ['Random']],
    ]);
  });

  it('lists distinct tags', () => {
    expect(allTags(list)).toEqual(['Goblins', 'Session 2', 'Session 10']);
  });

  it('filters by name/description and tag', () => {
    expect(filterEncounters(list, { query: 'amb' }).map((e) => e.name)).toEqual(['Ambush']);
    expect(filterEncounters(list, { tag: 'SESSION 2' }).map((e) => e.name)).toEqual(['Ambush', 'Boss']);
  });
});
