import type { CreatureTemplate } from '../models';
import { describe, expect, it } from 'vitest';
import { applyDamage, computeApplied, grantTempHP, heal, modifierFor, revive } from './damage';
import { canUndo, damageCombatant, damageMany, defeatedXP, describeLogEntry, healCombatant, undoLogEntry } from './combat';
import { makeCombat, makeCombatant } from './testUtils';

describe('computeApplied', () => {
  it('normal passes raw damage through', () => {
    expect(computeApplied(7, 'normal')).toBe(7);
  });
  it('resisted halves and rounds down (7 → 3)', () => {
    expect(computeApplied(7, 'resisted')).toBe(3);
    expect(computeApplied(1, 'resisted')).toBe(0);
    expect(computeApplied(8, 'resisted')).toBe(4);
  });
  it('vulnerable doubles', () => {
    expect(computeApplied(7, 'vulnerable')).toBe(14);
  });
  it('treats negative input as 0', () => {
    expect(computeApplied(-5, 'normal')).toBe(0);
  });
});

describe('applyDamage', () => {
  it('temp HP absorbs damage first', () => {
    const c = makeCombatant({ currentHP: 10, maxHP: 10, tempHP: 5 });
    const r = applyDamage(c, 3, 'normal');
    expect(r.combatant.tempHP).toBe(2);
    expect(r.combatant.currentHP).toBe(10);
  });

  it('overflow past temp HP hits current HP', () => {
    const c = makeCombatant({ currentHP: 10, maxHP: 10, tempHP: 5 });
    const r = applyDamage(c, 8, 'normal');
    expect(r.combatant.tempHP).toBe(0);
    expect(r.combatant.currentHP).toBe(7);
  });

  it('applies the modifier before temp HP', () => {
    const c = makeCombatant({ currentHP: 10, maxHP: 10, tempHP: 4 });
    const r = applyDamage(c, 7, 'resisted'); // 3 applied, all absorbed
    expect(r.applied).toBe(3);
    expect(r.combatant.tempHP).toBe(1);
    expect(r.combatant.currentHP).toBe(10);
  });

  it('never drops below 0 and marks the creature dead', () => {
    const c = makeCombatant({ currentHP: 5 });
    const r = applyDamage(c, 20, 'normal');
    expect(r.combatant.currentHP).toBe(0);
    expect(r.combatant.isDead).toBe(true);
    expect(r.killed).toBe(true);
  });

  it('exactly 0 HP is death', () => {
    const r = applyDamage(makeCombatant({ currentHP: 5 }), 5, 'normal');
    expect(r.combatant.isDead).toBe(true);
  });

  it('does not mark players dead', () => {
    const r = applyDamage(makeCombatant({ kind: 'player', currentHP: 5 }), 10, 'normal');
    expect(r.combatant.isDead).toBe(false);
  });
});

describe('heal / temp HP / revive', () => {
  it('heals up to max', () => {
    expect(heal(makeCombatant({ currentHP: 2, maxHP: 7 }), 100).currentHP).toBe(7);
  });
  it('healing a dead creature revives it', () => {
    const c = heal(makeCombatant({ currentHP: 0, isDead: true }), 3);
    expect(c.isDead).toBe(false);
    expect(c.currentHP).toBe(3);
  });
  it('temp HP keeps the higher value', () => {
    expect(grantTempHP(makeCombatant({ tempHP: 5 }), 3).tempHP).toBe(5);
    expect(grantTempHP(makeCombatant({ tempHP: 5 }), 8).tempHP).toBe(8);
  });
  it('revive gives at least 1 HP', () => {
    const c = revive(makeCombatant({ currentHP: 0, isDead: true }));
    expect(c.isDead).toBe(false);
    expect(c.currentHP).toBe(1);
  });
});

describe('logged damage, XP and undo', () => {
  it('logs damage with the applied amount and HP after', () => {
    const g = makeCombatant({ currentHP: 7 });
    const combat = damageCombatant(makeCombat([g]), g.id, 7, 'resisted');
    expect(combat.log).toHaveLength(1);
    expect(combat.log[0]).toMatchObject({ type: 'damage', rawDamage: 7, appliedDamage: 3, hpAfter: 4, modifier: 'resisted' });
  });

  it('adds XP for dead creatures only', () => {
    const a = makeCombatant({ xp: 50 });
    const b = makeCombatant({ xp: 200 });
    let combat = makeCombat([a, b]);
    combat = damageCombatant(combat, a.id, 100, 'normal');
    expect(defeatedXP(combat)).toBe(50);
  });

  it('undo restores HP and death state', () => {
    const g = makeCombatant({ currentHP: 7 });
    let combat = damageCombatant(makeCombat([g]), g.id, 10, 'normal');
    expect(combat.combatants[0]!.isDead).toBe(true);
    combat = undoLogEntry(combat, combat.log[0]!.id);
    expect(combat.combatants[0]).toMatchObject({ currentHP: 7, isDead: false });
    expect(combat.log).toHaveLength(0);
  });

  it('only the latest HP event for a combatant can be undone', () => {
    const g = makeCombatant({ currentHP: 7 });
    let combat = makeCombat([g]);
    combat = damageCombatant(combat, g.id, 2, 'normal');
    combat = healCombatant(combat, g.id, 1);
    expect(canUndo(combat, combat.log[0]!.id)).toBe(false);
    expect(canUndo(combat, combat.log[1]!.id)).toBe(true);
  });

  it('multi-target damage applies each modifier separately', () => {
    const a = makeCombatant({ currentHP: 20, maxHP: 20 });
    const b = makeCombatant({ currentHP: 20, maxHP: 20 });
    const c = makeCombatant({ currentHP: 20, maxHP: 20 });
    const combat = damageMany(makeCombat([a, b, c]), 7, [
      { id: a.id, modifier: 'normal' },
      { id: b.id, modifier: 'resisted' },
      { id: c.id, modifier: 'vulnerable' },
    ]);
    expect(combat.combatants.map((x) => x.currentHP)).toEqual([13, 17, 6]);
    expect(combat.log).toHaveLength(3);
  });
});

describe('damage type vs. stat block', () => {
  const t: Pick<CreatureTemplate, 'damageResistances' | 'damageVulnerabilities' | 'damageImmunities'> = {
    damageResistances: ['cold', 'slashing'],
    damageVulnerabilities: ['cold', 'radiant'],
    damageImmunities: ['fire'],
  };

  it('picks the modifier from the stat block', () => {
    expect(modifierFor(t, 'fire')).toBe('immune');
    expect(modifierFor(t, 'slashing')).toBe('resisted');
    expect(modifierFor(t, 'radiant')).toBe('vulnerable');
    expect(modifierFor(t, 'acid')).toBe('normal');
  });

  it('resistance and vulnerability to the same type cancel out', () => {
    expect(modifierFor(t, 'cold')).toBe('normal');
  });

  it('untyped damage and players without a stat block are normal', () => {
    expect(modifierFor(t, null)).toBe('normal');
    expect(modifierFor(undefined, 'fire')).toBe('normal');
  });

  it('immune takes no damage', () => {
    expect(computeApplied(30, 'immune')).toBe(0);
    const g = makeCombatant({ currentHP: 10, maxHP: 10 });
    const combat = damageCombatant(makeCombat([g]), g.id, 30, 'immune', 'fire');
    expect(combat.combatants[0]!.currentHP).toBe(10);
    expect(combat.combatants[0]!.isDead).toBe(false);
  });

  it('records the damage type and shows it in the log', () => {
    const g = makeCombatant({ currentHP: 20, maxHP: 20 });
    let combat = damageCombatant(makeCombat([g]), g.id, 7, 'resisted', 'slashing');
    combat = damageCombatant(combat, g.id, 4, 'normal', 'acid');
    combat = damageCombatant(combat, g.id, 9, 'immune', 'fire');
    combat = damageCombatant(combat, g.id, 2, 'normal');
    expect(combat.log[0]!.damageType).toBe('slashing');
    expect(combat.log[3]!.damageType).toBeUndefined();
    expect(combat.log.map((e) => describeLogEntry(e, () => 'Goblin', () => ''))).toEqual([
      'Goblin takes 3 slashing damage (7 resisted) → 17 HP',
      'Goblin takes 4 acid damage → 13 HP',
      'Goblin takes 0 fire damage (9 immune) → 13 HP',
      'Goblin takes 2 damage → 11 HP',
    ]);
  });

  it('multi-target damage records the type on every entry', () => {
    const a = makeCombatant({ currentHP: 20, maxHP: 20 });
    const b = makeCombatant({ currentHP: 20, maxHP: 20 });
    const combat = damageMany(makeCombat([a, b]), 8, [
      { id: a.id, modifier: 'normal' },
      { id: b.id, modifier: 'immune' },
    ], 'fire');
    expect(combat.combatants.map((x) => x.currentHP)).toEqual([12, 20]);
    expect(combat.log.map((e) => e.damageType)).toEqual(['fire', 'fire']);
  });
});
