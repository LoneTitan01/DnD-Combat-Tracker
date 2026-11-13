import type { Player } from '../models';
import { encounterDifficulty } from './xp';

export const LEVEL_RANGE = [1, 20] as const;
export const INIT_BONUS_RANGE = [-10, 20] as const;
export const PASSIVE_RANGE = [1, 40] as const;

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, n));

/** Parses an optional whole-number field; blank or non-numeric input means "not set". */
export function parseOptionalInt(text: string, range: readonly [number, number]): number | undefined {
  const t = text.trim();
  if (t === '' || !/^[+-]?\d+$/.test(t)) return undefined;
  return clamp(Number(t), range);
}

export interface PlayerInput {
  name: string;
  level: string;
  initiativeBonus: string;
  passivePerception: string;
}

/** Turns form text into Player fields: trimmed name, clamped numbers, blank optional fields left unset. */
export function playerFromInput(input: PlayerInput): Omit<Player, 'id'> | null {
  const name = input.name.trim();
  if (!name) return null;
  return {
    name,
    level: parseOptionalInt(input.level, LEVEL_RANGE),
    initiativeBonus: parseOptionalInt(input.initiativeBonus, INIT_BONUS_RANGE) ?? 0,
    passivePerception: parseOptionalInt(input.passivePerception, PASSIVE_RANGE),
  };
}

/** Lower-cased names used by more than one player. They'd clash as token names in combat. */
export function duplicatePlayerNames(players: readonly Pick<Player, 'name'>[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of players) {
    const k = p.name.trim().toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
}

export interface PartySummary {
  /** Players with a level set; only they count toward difficulty. */
  levelled: number;
  missingLevel: number;
  averageLevel: number | null;
  /** Party XP thresholds: [easy, medium, hard, deadly]. */
  thresholds: [number, number, number, number];
}

export function partySummary(players: readonly Pick<Player, 'level'>[]): PartySummary {
  const levels = players.map((p) => p.level).filter((l): l is number => l !== undefined);
  return {
    levelled: levels.length,
    missingLevel: players.length - levels.length,
    averageLevel: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null,
    thresholds: encounterDifficulty([], levels).thresholds,
  };
}
