import { describe, expect, it } from 'vitest';
import {
  blankCreature,
  changeCR,
  changeHitDice,
  changeSize,
  conHitDiceBonus,
  creatureTypes,
  duplicateCreature,
  filterCreatures,
  normalizeCreature,
  rechargeLabel,
  validateCreature,
} from './creature';
import { makeTemplate } from './testUtils';

describe('CR → XP auto-fill', () => {
  it('fills the standard XP when CR changes', () => {
    let t = blankCreature();
    t = changeCR(t, '1/4');
    expect(t.xp).toBe(50);
    t = changeCR(t, '5');
    expect(t.xp).toBe(1800);
  });

  it('keeps a homebrew XP override', () => {
    let t = { ...changeCR(blankCreature(), '1'), xp: 333 };
    t = changeCR(t, '2');
    expect(t.xp).toBe(333);
  });

  it('keeps XP for an unknown CR', () => {
    const t = changeCR(changeCR(blankCreature(), '30'), '31');
    expect(t.xp).toBe(155000);
  });
});

describe('size, hit dice and HP', () => {
  it('moves the die to the size default', () => {
    const t = changeSize(blankCreature(), 'Large');
    expect(t.hitDice.dieType).toBe('d10');
  });

  it('keeps a hand-picked die when size changes', () => {
    let t = changeHitDice(blankCreature(), { count: 1, dieType: 'd12', bonus: 0 });
    t = changeSize(t, 'Tiny');
    expect(t.hitDice.dieType).toBe('d12');
  });

  it('keeps max HP on the average while it was the average', () => {
    const t = changeHitDice(blankCreature(), { count: 7, dieType: 'd10', bonus: 14 });
    expect(t.maxHP).toBe(52);
  });

  it('keeps hand-set max HP', () => {
    const t = changeHitDice({ ...blankCreature(), maxHP: 99 }, { count: 7, dieType: 'd10', bonus: 14 });
    expect(t.maxHP).toBe(99);
  });

  it('suggests the hit dice bonus from CON', () => {
    const t = { ...blankCreature(), hitDice: { count: 7, dieType: 'd10' as const, bonus: 0 } };
    t.abilities = { ...t.abilities, con: 15 };
    expect(conHitDiceBonus(t)).toBe(14);
  });
});

describe('rechargeLabel', () => {
  it('formats each mode', () => {
    expect(rechargeLabel({ mode: 'threshold', minRoll: 5 })).toBe('Recharge 5–6');
    expect(rechargeLabel({ mode: 'threshold', minRoll: 6 })).toBe('Recharge 6');
    expect(rechargeLabel({ mode: 'fixed', turns: 3 })).toBe('Recharges after 3 turns');
    expect(rechargeLabel({ mode: 'rolled', dice: '1d4+1' })).toBe('Recharges in 1d4+1 turns');
  });
});

describe('duplicateCreature', () => {
  it('gives new ids and a unique copy name', () => {
    const t = makeTemplate({
      name: 'Goblin',
      actions: [{ id: 'a1', name: 'Scimitar', description: '', kind: 'action' }],
    });
    const d = duplicateCreature(t, ['Goblin', 'Goblin (copy)']);
    expect(d.name).toBe('Goblin (copy 2)');
    expect(d.id).not.toBe(t.id);
    expect(d.actions[0]!.id).not.toBe('a1');
    expect(d.actions[0]!.name).toBe('Scimitar');
  });
});

describe('validateCreature', () => {
  it('accepts a complete creature', () => {
    expect(validateCreature(makeTemplate())).toEqual([]);
  });

  it('requires a name', () => {
    expect(validateCreature(blankCreature())).toContain('Name is required.');
  });

  it('checks recharge settings', () => {
    const t = makeTemplate({
      actions: [
        { id: 'a', name: 'Breath', description: '', kind: 'action', recharge: { mode: 'rolled', dice: 'lots' } },
        { id: 'b', name: 'Roar', description: '', kind: 'action', recharge: { mode: 'threshold', minRoll: 7 } },
        { id: 'c', name: 'Pulse', description: '', kind: 'action', recharge: { mode: 'fixed', turns: 0 } },
      ],
    });
    expect(validateCreature(t)).toHaveLength(3);
  });

  it('rejects a bad CR', () => {
    expect(validateCreature(makeTemplate({ cr: 'high' }))).toContain('CR must be a number or a fraction like 1/4.');
  });
});

describe('filterCreatures', () => {
  const list = [
    makeTemplate({ name: 'Goblin', type: 'humanoid', cr: '1/4' }),
    makeTemplate({ name: 'Owlbear', type: 'Monstrosity', cr: '3' }),
    makeTemplate({ name: 'Goblin Boss', type: 'humanoid', cr: '1' }),
    makeTemplate({ name: 'Adult Red Dragon', type: 'dragon', cr: '17' }),
  ];
  const names = (l: { name: string }[]) => l.map((t) => t.name);

  it('searches by name, case-insensitively', () => {
    expect(names(filterCreatures(list, { query: 'gob' }))).toEqual(['Goblin', 'Goblin Boss']);
  });
  it('filters by type', () => {
    expect(names(filterCreatures(list, { type: 'monstrosity' }))).toEqual(['Owlbear']);
  });
  it('filters by CR range including fractions', () => {
    expect(names(filterCreatures(list, { crMin: '1/4', crMax: '3' }))).toEqual(['Goblin', 'Goblin Boss', 'Owlbear']);
  });
  it('sorts by CR', () => {
    expect(names(filterCreatures(list, { sort: 'cr' }))).toEqual(['Goblin', 'Goblin Boss', 'Owlbear', 'Adult Red Dragon']);
  });
  it('lists distinct types', () => {
    expect(creatureTypes(list)).toEqual(['dragon', 'humanoid', 'monstrosity']);
  });
});

describe('normalizeCreature', () => {
  it('fills a minimal import with defaults', () => {
    const t = normalizeCreature({ name: 'Bandit', cr: '1/8', size: 'Medium' })!;
    expect(t.name).toBe('Bandit');
    expect(t.xp).toBe(25);
    expect(t.hitDice.dieType).toBe('d8');
    expect(t.abilities.dex).toBe(10);
    expect(t.id).toBeTruthy();
  });

  it('drops unknown damage types and conditions', () => {
    const t = normalizeCreature({ name: 'X', damageResistances: ['fire', 'chaos'], conditionImmunities: ['charmed', 'bored'] })!;
    expect(t.damageResistances).toEqual(['fire']);
    expect(t.conditionImmunities).toEqual(['charmed']);
  });

  it('keeps ids, numeric CRs and recharge settings', () => {
    const t = normalizeCreature({
      id: 'keep-me',
      name: 'Drake',
      cr: 2,
      actions: [{ name: 'Breath', recharge: { mode: 'threshold', minRoll: 6 } }],
    })!;
    expect(t.id).toBe('keep-me');
    expect(t.cr).toBe('2');
    expect(t.xp).toBe(450);
    expect(t.actions[0]).toMatchObject({ name: 'Breath', kind: 'action', recharge: { mode: 'threshold', minRoll: 6 } });
  });

  it('rejects entries without a name', () => {
    expect(normalizeCreature({ cr: '1' })).toBeNull();
    expect(normalizeCreature('goblin')).toBeNull();
  });

  it('round-trips a full template unchanged', () => {
    const t = makeTemplate({
      traits: [{ id: 't1', name: 'Nimble Escape', description: 'Disengage or Hide as a bonus action.' }],
      actions: [{ id: 'a1', name: 'Breath', description: '', kind: 'action', recharge: { mode: 'fixed', turns: 2 } }],
      damageResistances: ['cold'],
    });
    expect(normalizeCreature(JSON.parse(JSON.stringify(t)))).toEqual({ ...t, acNote: '' });
  });
});
