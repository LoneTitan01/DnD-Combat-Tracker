import { describe, expect, it } from 'vitest';
import { abilityMod, averageHP, parseDice, rollDice, rollHP } from './dice';
import { crToNumber, encounterDifficulty, encounterMultiplier, xpForCR, xpPerPlayer } from './xp';
import { dieRng } from './testUtils';

describe('xpForCR', () => {
  it('returns standard XP', () => {
    expect(xpForCR('1/4')).toBe(50);
    expect(xpForCR('1')).toBe(200);
    expect(xpForCR('5')).toBe(1800);
    expect(xpForCR('30')).toBe(155000);
  });
  it('returns undefined for homebrew CRs', () => {
    expect(xpForCR('31')).toBeUndefined();
  });
  it('converts CR to numbers for sorting', () => {
    expect(crToNumber('1/8')).toBe(0.125);
    expect(crToNumber('12')).toBe(12);
  });
});

describe('encounter difficulty', () => {
  it('applies the monster-count multiplier', () => {
    expect(encounterMultiplier(1)).toBe(1);
    expect(encounterMultiplier(2)).toBe(1.5);
    expect(encounterMultiplier(4)).toBe(2);
    expect(encounterMultiplier(8)).toBe(2.5);
    expect(encounterMultiplier(12)).toBe(3);
    expect(encounterMultiplier(15)).toBe(4);
  });
  it('adjusts the multiplier for small and large parties', () => {
    expect(encounterMultiplier(1, 2)).toBe(1.5);
    expect(encounterMultiplier(1, 6)).toBe(0.5);
    expect(encounterMultiplier(15, 2)).toBe(5);
  });
  it('labels difficulty against party thresholds', () => {
    // 4 goblins vs four level-1 PCs: 200 × 2 = 400 adjusted; deadly threshold = 400.
    const r = encounterDifficulty([50, 50, 50, 50], [1, 1, 1, 1]);
    expect(r).toMatchObject({ baseXP: 200, multiplier: 2, adjustedXP: 400, difficulty: 'deadly' });
    expect(r.thresholds).toEqual([100, 200, 300, 400]);
  });
  it('has no label without party levels', () => {
    expect(encounterDifficulty([50], []).difficulty).toBeNull();
  });
  it('splits XP rounding down', () => {
    expect(xpPerPlayer(250, 4)).toBe(62);
    expect(xpPerPlayer(250, 0)).toBe(0);
  });
});

describe('dice', () => {
  it('parses expressions', () => {
    expect(parseDice('1d6')).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(parseDice('d6')).toEqual({ count: 1, sides: 6, bonus: 0 });
    expect(parseDice('1d4+1')).toEqual({ count: 1, sides: 4, bonus: 1 });
    expect(parseDice('2d6 - 1')).toEqual({ count: 2, sides: 6, bonus: -1 });
    expect(parseDice('3')).toEqual({ count: 0, sides: 0, bonus: 3 });
    expect(parseDice('banana')).toBeNull();
  });
  it('rolls with an injected rng', () => {
    expect(rollDice('1d4+1', dieRng([4, 4]))).toBe(5);
    expect(rollDice('2d6', dieRng([1, 6]))).toBe(2);
  });
  it('computes printed average HP (7d10 + 14 = 52)', () => {
    expect(averageHP({ count: 7, dieType: 'd10', bonus: 14 })).toBe(52);
    expect(averageHP({ count: 2, dieType: 'd6', bonus: 0 })).toBe(7);
  });
  it('rolled HP is at least 1', () => {
    expect(rollHP({ count: 1, dieType: 'd4', bonus: -5 }, dieRng([1, 4]))).toBe(1);
  });
  it('computes ability modifiers', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(11)).toBe(0);
    expect(abilityMod(9)).toBe(-1);
    expect(abilityMod(1)).toBe(-5);
    expect(abilityMod(20)).toBe(5);
  });
});
