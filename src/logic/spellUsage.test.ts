import { describe, expect, it } from 'vitest';
import type { Spell } from '../models';
import { canUndo, changeSpellUses, describeLogEntry, spellUsesSpent, undoLogEntry, useAbility } from './combat';
import { normalizeCreature } from './creature';
import { blankSpell, limitedSpells, setLinkedSpells, setSpellUsage, spellUsageLabel, spellUsageOf } from './spells';
import { makeCombat, makeCombatant, makeTemplate } from './testUtils';

const spell = (name: string, level = 3): Spell => ({ ...blankSpell(), id: name, name, level });

describe('limited-use spells on a stat block', () => {
  it('sets, changes and clears a limit, dropping the map when empty', () => {
    let t = makeTemplate({ spellIds: ['Fireball', 'Shield'] });
    t = setSpellUsage(t, 'Fireball', { uses: 3, per: 'long' });
    expect(spellUsageOf(t, 'Fireball')).toEqual({ uses: 3, per: 'long' });
    expect(spellUsageOf(t, 'Shield')).toBeUndefined();
    t = setSpellUsage(t, 'Fireball', { uses: 0, per: 'short' });
    expect(t.spellUsage).toEqual({ Fireball: { uses: 1, per: 'short' } });
    t = setSpellUsage(t, 'Fireball', null);
    expect(t).not.toHaveProperty('spellUsage');
  });

  it('unlinking a spell drops its limit', () => {
    let t = setSpellUsage(makeTemplate({ spellIds: ['Fireball', 'Shield'] }), 'Fireball', { uses: 2, per: 'long' });
    t = setSpellUsage(t, 'Shield', { uses: 1, per: 'short' });
    t = setLinkedSpells(t, ['Shield']);
    expect(t.spellIds).toEqual(['Shield']);
    expect(t.spellUsage).toEqual({ Shield: { uses: 1, per: 'short' } });
    expect(setLinkedSpells(t, [])).not.toHaveProperty('spellUsage');
  });

  it('lists limited spells in spell-list order, with labels', () => {
    const t = setSpellUsage(
      setSpellUsage(makeTemplate({ spellIds: ['Fireball', 'Shield', 'Bless'] }), 'Fireball', { uses: 3, per: 'long' }),
      'Bless',
      { uses: 1, per: 'short' },
    );
    const all = [spell('Fireball', 3), spell('Shield', 1), spell('Bless', 1)];
    expect(limitedSpells(t, all).map((x) => x.spell.name)).toEqual(['Bless', 'Fireball']);
    expect(spellUsageLabel({ uses: 3, per: 'long' })).toBe('3/long rest');
  });

  it('imports limits only for linked spells and cleans bad values', () => {
    const c = normalizeCreature({
      name: 'Mage',
      spellIds: ['Fireball', 'Shield'],
      spellUsage: { Fireball: { uses: 2.7, per: 'short' }, Shield: { uses: -1, per: 'weekly' }, Gone: { uses: 1, per: 'long' } },
    })!;
    expect(c.spellUsage).toEqual({ Fireball: { uses: 2, per: 'short' }, Shield: { uses: 1, per: 'long' } });
    expect(normalizeCreature({ name: 'Goblin' })).not.toHaveProperty('spellUsage');
  });
});

describe('spending spell uses in combat', () => {
  it('casts up to the limit, gives uses back, and logs each change', () => {
    const m = makeCombatant({ tokenName: 'Mage' });
    let c = makeCombat([m]);
    c = changeSpellUses(c, m.id, 'Fireball', 1, 2);
    c = changeSpellUses(c, m.id, 'Fireball', 1, 2);
    expect(spellUsesSpent(c.combatants[0]!, 'Fireball')).toBe(2);
    expect(changeSpellUses(c, m.id, 'Fireball', 1, 2)).toBe(c); // out of uses
    c = changeSpellUses(c, m.id, 'Fireball', -1, 2);
    expect(spellUsesSpent(c.combatants[0]!, 'Fireball')).toBe(1);
    c = changeSpellUses(c, m.id, 'Fireball', -1, 2);
    expect(c.combatants[0]!.spellsUsed).toEqual({});
    expect(changeSpellUses(c, m.id, 'Fireball', -1, 2)).toBe(c); // nothing to give back
    const text = c.log.map((e) => describeLogEntry(e, () => 'Mage', () => '', (id) => id));
    expect(text).toEqual([
      'Mage casts Fireball (1 used)',
      'Mage casts Fireball (2 used)',
      'Mage: Fireball use taken back (1 used)',
      'Mage: Fireball use taken back (0 used)',
    ]);
  });

  it('undo restores only that spell, and is its own stream', () => {
    const m = makeCombatant({ abilityStates: [{ actionId: 'breath', status: 'ready' }] });
    let c = makeCombat([m]);
    c = changeSpellUses(c, m.id, 'Fireball', 1, 3);
    c = changeSpellUses(c, m.id, 'Shield', 1, 1);
    c = useAbility(c, m.id, 'breath', { mode: 'threshold', minRoll: 5 });
    const [fire, shield, breath] = c.log;
    // Later entries for other spells or abilities don't block undoing the Fireball cast.
    expect(canUndo(c, fire!.id)).toBe(true);
    c = undoLogEntry(c, fire!.id);
    expect(c.combatants[0]!.spellsUsed).toEqual({ Shield: 1 });
    expect(c.combatants[0]!.abilityStates[0]!.status).toBe('thresholdRoll');
    expect(canUndo(c, shield!.id) && canUndo(c, breath!.id)).toBe(true);
    // A second cast of the same spell blocks undoing the first.
    c = changeSpellUses(c, m.id, 'Shield', -1, 1);
    expect(canUndo(c, shield!.id)).toBe(false);
  });
});
