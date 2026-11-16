import { describe, expect, it } from 'vitest';
import { canUndo, changeSlotUses, changeSpellUses, describeLogEntry, slotsSpent, undoLogEntry } from './combat';
import { normalizeCreature } from './creature';
import {
  normalizeSpellSlots,
  setSpellResource,
  setSpellSlots,
  setSpellUsage,
  slotLevels,
  spellResourceOf,
  spellSlotsOf,
} from './spells';
import { makeCombat, makeCombatant, makeTemplate } from './testUtils';

describe('spell resource on a stat block', () => {
  it('defaults to per-spell uses and switches without losing either setting', () => {
    let t = setSpellUsage(makeTemplate({ spellIds: ['Fireball'] }), 'Fireball', { uses: 2, per: 'long' });
    expect(spellResourceOf(t)).toBe('perSpell');
    t = setSpellSlots(setSpellResource(t, 'slots'), 1, 4);
    expect(spellResourceOf(t)).toBe('slots');
    t = setSpellResource(t, 'perSpell');
    expect(t).not.toHaveProperty('spellResource');
    expect(t.spellUsage).toEqual({ Fireball: { uses: 2, per: 'long' } });
    expect(spellSlotsOf(t)[0]).toBe(4);
  });

  it('sets slot counts per level, drops the list when all zero, and ignores bad levels', () => {
    let t = setSpellResource(makeTemplate(), 'slots');
    t = setSpellSlots(t, 1, 4);
    t = setSpellSlots(t, 3, 2.9);
    expect(t.spellSlots).toEqual([4, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(slotLevels(t)).toEqual([
      { level: 1, slots: 4 },
      { level: 3, slots: 2 },
    ]);
    expect(setSpellSlots(t, 10, 1)).toBe(t);
    t = setSpellSlots(setSpellSlots(t, 1, 0), 3, -1);
    expect(t).not.toHaveProperty('spellSlots');
  });

  it('has no slot levels when tracking per-spell uses', () => {
    const t = setSpellSlots(makeTemplate(), 2, 3);
    expect(slotLevels(t)).toEqual([]);
  });

  it('imports the resource and cleans slot counts', () => {
    expect(normalizeSpellSlots([4, 3.5, -2, 'x'])).toEqual([4, 3, 0, 0, 0, 0, 0, 0, 0]);
    expect(normalizeSpellSlots([0, 0])).toBeUndefined();
    expect(normalizeSpellSlots('4')).toBeUndefined();
    const c = normalizeCreature({ name: 'Mage', spellResource: 'slots', spellSlots: [4, 3, 3] })!;
    expect(c.spellResource).toBe('slots');
    expect(c.spellSlots).toEqual([4, 3, 3, 0, 0, 0, 0, 0, 0]);
    const g = normalizeCreature({ name: 'Goblin', spellResource: 'mana' })!;
    expect(g).not.toHaveProperty('spellResource');
    expect(g).not.toHaveProperty('spellSlots');
  });
});

describe('spending spell slots in combat', () => {
  it('uses slots up to the count, gives them back, and logs each change', () => {
    const m = makeCombatant({ tokenName: 'Mage' });
    let c = makeCombat([m]);
    c = changeSlotUses(c, m.id, 3, 1, 2);
    c = changeSlotUses(c, m.id, 3, 1, 2);
    expect(slotsSpent(c.combatants[0]!, 3)).toBe(2);
    expect(changeSlotUses(c, m.id, 3, 1, 2)).toBe(c); // out of slots
    c = changeSlotUses(c, m.id, 3, -1, 2);
    expect(c.combatants[0]!.slotsUsed).toEqual({ 3: 1 });
    c = changeSlotUses(c, m.id, 3, -1, 2);
    expect(c.combatants[0]!.slotsUsed).toEqual({});
    expect(changeSlotUses(c, m.id, 3, -1, 2)).toBe(c); // nothing to give back
    expect(c.log.map((e) => describeLogEntry(e, () => 'Mage', () => ''))).toEqual([
      'Mage uses a 3rd-level spell slot (1 used)',
      'Mage uses a 3rd-level spell slot (2 used)',
      'Mage: 3rd-level spell slot given back (1 used)',
      'Mage: 3rd-level spell slot given back (0 used)',
    ]);
  });

  it('undo restores only that slot level, separate from spell uses', () => {
    const m = makeCombatant();
    let c = makeCombat([m]);
    c = changeSlotUses(c, m.id, 1, 1, 4);
    c = changeSlotUses(c, m.id, 2, 1, 3);
    c = changeSpellUses(c, m.id, 'Shield', 1, 1);
    const [first, second] = c.log;
    expect(canUndo(c, first!.id)).toBe(true);
    c = undoLogEntry(c, first!.id);
    expect(c.combatants[0]!.slotsUsed).toEqual({ 2: 1 });
    expect(c.combatants[0]!.spellsUsed).toEqual({ Shield: 1 });
    c = changeSlotUses(c, m.id, 2, 1, 3);
    expect(canUndo(c, second!.id)).toBe(false);
  });
});
