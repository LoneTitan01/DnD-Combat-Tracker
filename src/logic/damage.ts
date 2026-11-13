import type { Combatant, CreatureTemplate, DamageModifier, DamageType } from '../models';

/** normal: d · resisted: floor(d / 2) (5e rounds down) · vulnerable: 2d · immune: 0 */
export function computeApplied(raw: number, modifier: DamageModifier): number {
  const d = Math.max(0, Math.floor(raw));
  switch (modifier) {
    case 'normal':
      return d;
    case 'resisted':
      return Math.floor(d / 2);
    case 'vulnerable':
      return d * 2;
    case 'immune':
      return 0;
  }
}

type Defenses = Pick<CreatureTemplate, 'damageResistances' | 'damageVulnerabilities' | 'damageImmunities'>;

/**
 * The modifier a stat block calls for against a damage type. Immunity wins. A creature that both
 * resists and is vulnerable to a type takes it normally (close enough; 5e halves then doubles).
 * Players and untyped damage are normal.
 */
export function modifierFor(t: Defenses | undefined, type: DamageType | null | undefined): DamageModifier {
  if (!t || !type) return 'normal';
  if (t.damageImmunities.includes(type)) return 'immune';
  const resists = t.damageResistances.includes(type);
  const vulnerable = t.damageVulnerabilities.includes(type);
  return resists === vulnerable ? 'normal' : resists ? 'resisted' : 'vulnerable';
}

export interface DamageResult {
  combatant: Combatant;
  /** Damage after the modifier, before temp HP absorbs any of it. */
  applied: number;
  /** Whether this hit took the creature from alive to dead. */
  killed: boolean;
}

/** Temp HP absorbs first, then current HP. HP never goes below 0. A creature at 0 HP is dead. */
export function applyDamage(c: Combatant, raw: number, modifier: DamageModifier): DamageResult {
  const applied = computeApplied(raw, modifier);
  const absorbed = Math.min(c.tempHP, applied);
  const tempHP = c.tempHP - absorbed;
  const currentHP = Math.max(0, c.currentHP - (applied - absorbed));
  const isDead = c.isDead || (c.kind === 'creature' && currentHP === 0);
  return {
    combatant: { ...c, tempHP, currentHP, isDead },
    applied,
    killed: isDead && !c.isDead,
  };
}

/** Raises HP up to max. Healing a dead creature above 0 revives it. */
export function heal(c: Combatant, amount: number): Combatant {
  const a = Math.max(0, Math.floor(amount));
  const currentHP = Math.min(c.maxHP, c.currentHP + a);
  return { ...c, currentHP, isDead: c.isDead && currentHP === 0 };
}

/** Temp HP doesn't stack: keep the higher of the old and new values. */
export function grantTempHP(c: Combatant, amount: number): Combatant {
  return { ...c, tempHP: Math.max(c.tempHP, Math.max(0, Math.floor(amount))) };
}

/** Brings a dead creature back with at least 1 HP. */
export function revive(c: Combatant, hp = 1): Combatant {
  return { ...c, isDead: false, currentHP: Math.min(c.maxHP, Math.max(1, Math.max(c.currentHP, hp))) };
}
