import type { DieType, HitDice, Size } from '../models';

/** Random source returning a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

export interface DiceExpr {
  count: number;
  sides: number;
  bonus: number;
}

const DICE_RE = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;
const CONST_RE = /^\s*([+-]?\d+)\s*$/;

/** Parses "1d6", "d6", "1d4+1", "2d6 - 1", or a plain number. Returns null if invalid. */
export function parseDice(expr: string): DiceExpr | null {
  const c = CONST_RE.exec(expr);
  if (c) return { count: 0, sides: 0, bonus: Number(c[1]) };
  const m = DICE_RE.exec(expr);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  if (count < 1 || count > 1000 || sides < 1) return null;
  const bonus = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return { count, sides, bonus };
}

export function rollDie(sides: number, rng: Rng = defaultRng): number {
  return Math.floor(rng() * sides) + 1;
}

export function rollExpr(d: DiceExpr, rng: Rng = defaultRng): number {
  let total = d.bonus;
  for (let i = 0; i < d.count; i++) total += rollDie(d.sides, rng);
  return total;
}

/** Rolls a dice expression string. Throws on an invalid expression. */
export function rollDice(expr: string, rng: Rng = defaultRng): number {
  const d = parseDice(expr);
  if (!d) throw new Error(`Invalid dice expression: "${expr}"`);
  return rollExpr(d, rng);
}

export function dieSides(die: DieType): number {
  return Number(die.slice(1));
}

export const DIE_FOR_SIZE: Record<Size, DieType> = {
  Tiny: 'd4',
  Small: 'd6',
  Medium: 'd8',
  Large: 'd10',
  Huge: 'd12',
  Gargantuan: 'd20',
};

/** Average HP as printed in 5e stat blocks: floor(count × (sides + 1) / 2) + bonus, minimum 1. */
export function averageHP(hd: HitDice): number {
  const avg = Math.floor((hd.count * (dieSides(hd.dieType) + 1)) / 2) + hd.bonus;
  return Math.max(1, avg);
}

export function rollHP(hd: HitDice, rng: Rng = defaultRng): number {
  return Math.max(1, rollExpr({ count: hd.count, sides: dieSides(hd.dieType), bonus: hd.bonus }, rng));
}

export function formatHitDice(hd: HitDice): string {
  if (hd.bonus === 0) return `${hd.count}${hd.dieType}`;
  return `${hd.count}${hd.dieType} ${hd.bonus > 0 ? '+' : '−'} ${Math.abs(hd.bonus)}`;
}

/** 5e ability modifier: floor((score − 10) / 2). Never typed by the user. */
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}
