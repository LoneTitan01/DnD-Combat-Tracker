import type { ChallengeRating } from '../models';

/** Standard 5e XP by challenge rating. */
export const CR_XP: ReadonlyArray<readonly [ChallengeRating, number]> = [
  ['0', 10],
  ['1/8', 25],
  ['1/4', 50],
  ['1/2', 100],
  ['1', 200],
  ['2', 450],
  ['3', 700],
  ['4', 1100],
  ['5', 1800],
  ['6', 2300],
  ['7', 2900],
  ['8', 3900],
  ['9', 5000],
  ['10', 5900],
  ['11', 7200],
  ['12', 8400],
  ['13', 10000],
  ['14', 11500],
  ['15', 13000],
  ['16', 15000],
  ['17', 18000],
  ['18', 20000],
  ['19', 22000],
  ['20', 25000],
  ['21', 33000],
  ['22', 41000],
  ['23', 50000],
  ['24', 62000],
  ['25', 75000],
  ['26', 90000],
  ['27', 105000],
  ['28', 120000],
  ['29', 135000],
  ['30', 155000],
];

export const CR_VALUES: ChallengeRating[] = CR_XP.map(([cr]) => cr);

const CR_XP_MAP = new Map(CR_XP);

/** XP for a CR, or undefined for an unknown CR (homebrew values are entered by hand). */
export function xpForCR(cr: ChallengeRating): number | undefined {
  return CR_XP_MAP.get(cr.trim());
}

/** Numeric value of a CR for sorting and filtering ("1/4" → 0.25). NaN if unparseable. */
export function crToNumber(cr: ChallengeRating): number {
  const s = cr.trim();
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return s === '' ? NaN : Number(s);
}

// --- Encounter difficulty (DMG 2014 method: thresholds per character level + monster-count multiplier) ---

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

/** [easy, medium, hard, deadly] XP thresholds per character, indexed by level − 1. */
const THRESHOLDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

const MULTIPLIER_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5] as const;

/**
 * Encounter multiplier for the number of monsters. Parties of fewer than 3 use the next step up;
 * parties of 6 or more use the next step down.
 */
export function encounterMultiplier(monsterCount: number, partySize = 4): number {
  if (monsterCount <= 0) return 1;
  let step: number;
  if (monsterCount === 1) step = 1;
  else if (monsterCount === 2) step = 2;
  else if (monsterCount <= 6) step = 3;
  else if (monsterCount <= 10) step = 4;
  else if (monsterCount <= 14) step = 5;
  else step = 6;
  if (partySize > 0 && partySize < 3) step += 1;
  else if (partySize >= 6) step -= 1;
  return MULTIPLIER_STEPS[Math.min(Math.max(step, 0), MULTIPLIER_STEPS.length - 1)]!;
}

export interface DifficultyResult {
  baseXP: number;
  multiplier: number;
  adjustedXP: number;
  /** Party totals: [easy, medium, hard, deadly]. Zeros when no party levels are known. */
  thresholds: [number, number, number, number];
  /** null when there are no party levels to compare against. */
  difficulty: Difficulty | null;
}

export function encounterDifficulty(
  monsterXPs: number[],
  partyLevels: number[],
): DifficultyResult {
  const baseXP = monsterXPs.reduce((a, b) => a + b, 0);
  const levels = partyLevels.filter((l) => Number.isFinite(l) && l >= 1);
  const multiplier = encounterMultiplier(monsterXPs.length, levels.length || 4);
  const adjustedXP = Math.round(baseXP * multiplier);
  const thresholds: [number, number, number, number] = [0, 0, 0, 0];
  for (const lvl of levels) {
    const row = THRESHOLDS[Math.min(Math.floor(lvl), 20) - 1]!;
    for (let i = 0; i < 4; i++) thresholds[i]! += row[i]!;
  }
  let difficulty: Difficulty | null = null;
  if (levels.length > 0) {
    if (adjustedXP >= thresholds[3]) difficulty = 'deadly';
    else if (adjustedXP >= thresholds[2]) difficulty = 'hard';
    else if (adjustedXP >= thresholds[1]) difficulty = 'medium';
    else if (adjustedXP >= thresholds[0]) difficulty = 'easy';
    else difficulty = 'trivial';
  }
  return { baseXP, multiplier, adjustedXP, thresholds, difficulty };
}

/** XP each player receives, rounded down. */
export function xpPerPlayer(totalXP: number, playerCount: number): number {
  return playerCount > 0 ? Math.floor(totalXP / playerCount) : 0;
}
