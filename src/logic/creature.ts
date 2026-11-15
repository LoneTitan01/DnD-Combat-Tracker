import {
  ABILITIES,
  ACTION_KINDS,
  CONDITIONS,
  DAMAGE_TYPES,
  DEFENSE_TYPES,
  DIE_TYPES,
  SIZES,
  type Action,
  type ChallengeRating,
  type CreatureTemplate,
  type DamageType,
  type DefenseType,
  type HitDice,
  type Recharge,
  type Size,
  type Trait,
} from '../models';
import { abilityMod, averageHP, DIE_FOR_SIZE, parseDice } from './dice';
import { newId } from './ids';
import { crToNumber, xpForCR } from './xp';

export function blankCreature(): CreatureTemplate {
  const now = Date.now();
  const hitDice: HitDice = { count: 1, dieType: 'd8', bonus: 0 };
  return {
    id: newId(),
    name: '',
    size: 'Medium',
    type: 'humanoid',
    alignment: 'unaligned',
    ac: 10,
    acNote: '',
    maxHP: averageHP(hitDice),
    hitDice,
    speed: '30 ft.',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: '',
    skills: '',
    damageResistances: [],
    damageVulnerabilities: [],
    damageImmunities: [],
    conditionImmunities: [],
    senses: 'passive Perception 10',
    languages: '—',
    cr: '0',
    xp: xpForCR('0')!,
    traits: [],
    actions: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- linked-field edits (auto-fill that the DM can still override) ----------

/** Changing CR updates XP to the standard value, unless XP was customised for homebrew. */
export function changeCR(t: CreatureTemplate, cr: ChallengeRating): CreatureTemplate {
  const oldStd = xpForCR(t.cr);
  const newStd = xpForCR(cr);
  const xpIsStandard = t.xp === 0 || (oldStd !== undefined && t.xp === oldStd);
  return { ...t, cr, xp: xpIsStandard && newStd !== undefined ? newStd : t.xp };
}

/** Changing hit dice keeps max HP on the average, unless it was set by hand. */
export function changeHitDice(t: CreatureTemplate, hitDice: HitDice): CreatureTemplate {
  const hpIsAverage = t.maxHP === averageHP(t.hitDice);
  return { ...t, hitDice, maxHP: hpIsAverage ? averageHP(hitDice) : t.maxHP };
}

/** Changing size moves the hit die to the size default, unless the die was changed by hand. */
export function changeSize(t: CreatureTemplate, size: Size): CreatureTemplate {
  const dieIsDefault = t.hitDice.dieType === DIE_FOR_SIZE[t.size];
  const dieType = dieIsDefault ? DIE_FOR_SIZE[size] : t.hitDice.dieType;
  return changeHitDice({ ...t, size }, { ...t.hitDice, dieType });
}

/** The usual hit dice bonus: number of dice × CON modifier. */
export function conHitDiceBonus(t: CreatureTemplate): number {
  return t.hitDice.count * abilityMod(t.abilities.con);
}

// ---------- labels ----------

export function rechargeLabel(r: Recharge): string {
  switch (r.mode) {
    case 'threshold': {
      const min = r.minRoll ?? 5;
      return min >= 6 ? 'Recharge 6' : `Recharge ${min}–6`;
    }
    case 'fixed': {
      const n = r.turns ?? 1;
      return `Recharges after ${n} turn${n === 1 ? '' : 's'}`;
    }
    case 'rolled':
      return `Recharges in ${r.dice || '1d6'} turns`;
  }
}

export const ACTION_KIND_LABELS: Record<Action['kind'], string> = {
  action: 'Actions',
  bonus: 'Bonus Actions',
  reaction: 'Reactions',
  legendary: 'Legendary Actions',
};

// ---------- duplicate ----------

/** Copy for making variants: new ids, a unique "(copy)" name. */
export function duplicateCreature(t: CreatureTemplate, existingNames: readonly string[]): CreatureTemplate {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  let name = `${t.name} (copy)`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${t.name} (copy ${i})`;
  const now = Date.now();
  return {
    ...structuredClone(t),
    id: newId(),
    name,
    traits: t.traits.map((x) => ({ ...x, id: newId() })),
    actions: t.actions.map((x) => ({ ...structuredClone(x), id: newId() })),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- validation ----------

export function validateRecharge(r: Recharge): string | null {
  switch (r.mode) {
    case 'fixed':
      return Number.isInteger(r.turns) && r.turns! >= 1 ? null : 'Fixed recharge needs at least 1 turn.';
    case 'rolled': {
      const d = r.dice ? parseDice(r.dice) : null;
      return d && d.count > 0 ? null : 'Rolled recharge needs dice like 1d6 or 1d4+1.';
    }
    case 'threshold':
      return Number.isInteger(r.minRoll) && r.minRoll! >= 2 && r.minRoll! <= 6
        ? null
        : 'Recharge roll must be between 2 and 6.';
  }
}

export function validateCreature(t: CreatureTemplate): string[] {
  const errors: string[] = [];
  if (!t.name.trim()) errors.push('Name is required.');
  if (!Number.isFinite(t.ac) || t.ac < 0) errors.push('AC must be 0 or more.');
  if (!Number.isFinite(t.maxHP) || t.maxHP < 1) errors.push('Max HP must be at least 1.');
  if (!Number.isInteger(t.hitDice.count) || t.hitDice.count < 1) errors.push('Hit dice count must be at least 1.');
  for (const a of ABILITIES) {
    const s = t.abilities[a];
    if (!Number.isInteger(s) || s < 1 || s > 30) errors.push(`${a.toUpperCase()} must be between 1 and 30.`);
  }
  if (!t.cr.trim() || Number.isNaN(crToNumber(t.cr))) errors.push('CR must be a number or a fraction like 1/4.');
  if (!Number.isFinite(t.xp) || t.xp < 0) errors.push('XP must be 0 or more.');
  for (const a of t.actions) {
    if (!a.name.trim()) errors.push(`Every ${a.kind === 'bonus' ? 'bonus action' : a.kind} needs a name.`);
    const r = a.recharge && validateRecharge(a.recharge);
    if (r) errors.push(`${a.name || 'Unnamed action'}: ${r}`);
  }
  for (const tr of t.traits) if (!tr.name.trim()) errors.push('Every trait needs a name.');
  return [...new Set(errors)];
}

// ---------- search & filter ----------

export interface CreatureFilter {
  query?: string;
  type?: string;
  crMin?: ChallengeRating;
  crMax?: ChallengeRating;
  sort?: 'name' | 'cr';
}

export function filterCreatures(list: readonly CreatureTemplate[], f: CreatureFilter = {}): CreatureTemplate[] {
  const q = f.query?.trim().toLowerCase() ?? '';
  const type = f.type?.trim().toLowerCase() ?? '';
  const min = f.crMin ? crToNumber(f.crMin) : -Infinity;
  const max = f.crMax ? crToNumber(f.crMax) : Infinity;
  const out = list.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (type && t.type.trim().toLowerCase() !== type) return false;
    const cr = crToNumber(t.cr);
    return !(cr < min || cr > max);
  });
  const byName = (a: CreatureTemplate, b: CreatureTemplate) => a.name.localeCompare(b.name);
  return out.sort(f.sort === 'cr' ? (a, b) => crToNumber(a.cr) - crToNumber(b.cr) || byName(a, b) : byName);
}

/** Distinct creature types for the filter dropdown, lower-cased and sorted. */
export function creatureTypes(list: readonly CreatureTemplate[]): string[] {
  return [...new Set(list.map((t) => t.type.trim().toLowerCase()).filter(Boolean))].sort();
}

// ---------- import normalisation ----------

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
  opts.includes(v as T) ? (v as T) : d;
const subset = <T extends string>(v: unknown, opts: readonly T[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => opts.includes(x as T)))] : [];
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function normalizeRecharge(v: unknown): Recharge | undefined {
  if (!v) return undefined;
  const o = obj(v);
  const mode = oneOf(o.mode, ['fixed', 'rolled', 'threshold'] as const, 'threshold');
  const r: Recharge = { mode };
  if (mode === 'fixed') r.turns = Math.max(1, Math.floor(num(o.turns, 1)));
  if (mode === 'rolled') r.dice = str(o.dice, '1d6');
  if (mode === 'threshold') r.minRoll = Math.min(6, Math.max(2, Math.floor(num(o.minRoll, 5))));
  return r;
}

/**
 * Turns an imported (possibly partial or hand-written) object into a valid CreatureTemplate,
 * filling gaps with defaults. Returns null when it has no name.
 */
export function normalizeCreature(raw: unknown): CreatureTemplate | null {
  const o = obj(raw);
  const name = str(o.name).trim();
  if (!name) return null;
  const base = blankCreature();
  const hd = obj(o.hitDice);
  const ab = obj(o.abilities);
  const size = oneOf(o.size, SIZES, base.size);
  const hitDice: HitDice = {
    count: Math.max(1, Math.floor(num(hd.count, 1))),
    dieType: oneOf(hd.dieType, DIE_TYPES, DIE_FOR_SIZE[size]),
    bonus: Math.floor(num(hd.bonus, 0)),
  };
  const cr = typeof o.cr === 'number' ? String(o.cr) : str(o.cr, base.cr);
  const traits: Trait[] = (Array.isArray(o.traits) ? o.traits : []).map((t) => {
    const x = obj(t);
    return { id: str(x.id) || newId(), name: str(x.name), description: str(x.description) };
  });
  const actions: Action[] = (Array.isArray(o.actions) ? o.actions : []).map((a) => {
    const x = obj(a);
    const action: Action = {
      id: str(x.id) || newId(),
      name: str(x.name),
      description: str(x.description),
      kind: oneOf(x.kind, ACTION_KINDS, 'action'),
    };
    const recharge = normalizeRecharge(x.recharge);
    if (recharge) action.recharge = recharge;
    return action;
  });
  return {
    id: str(o.id) || base.id,
    name,
    size,
    type: str(o.type, base.type),
    alignment: str(o.alignment, base.alignment),
    ac: num(o.ac, base.ac),
    acNote: str(o.acNote),
    maxHP: Math.max(1, num(o.maxHP, averageHP(hitDice))),
    hitDice,
    speed: str(o.speed, base.speed),
    abilities: Object.fromEntries(
      ABILITIES.map((k) => [k, Math.min(30, Math.max(1, Math.floor(num(ab[k], 10))))]),
    ) as CreatureTemplate['abilities'],
    saves: str(o.saves),
    skills: str(o.skills),
    damageResistances: subset<DefenseType>(o.damageResistances, DEFENSE_TYPES),
    damageVulnerabilities: subset<DamageType>(o.damageVulnerabilities, DAMAGE_TYPES),
    damageImmunities: subset<DefenseType>(o.damageImmunities, DEFENSE_TYPES),
    conditionImmunities: subset(o.conditionImmunities, CONDITIONS),
    senses: str(o.senses, base.senses),
    languages: str(o.languages, base.languages),
    cr,
    xp: num(o.xp, xpForCR(cr) ?? 0),
    traits,
    actions,
    notes: str(o.notes),
    createdAt: num(o.createdAt, base.createdAt),
    updatedAt: num(o.updatedAt, base.updatedAt),
  };
}
