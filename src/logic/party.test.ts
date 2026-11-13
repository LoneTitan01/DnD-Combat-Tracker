import { describe, expect, it } from 'vitest';
import { duplicatePlayerNames, parseOptionalInt, partySummary, playerFromInput } from './party';

describe('parseOptionalInt', () => {
  it('treats blank and junk as unset', () => {
    expect(parseOptionalInt('', [1, 20])).toBeUndefined();
    expect(parseOptionalInt('  ', [1, 20])).toBeUndefined();
    expect(parseOptionalInt('abc', [1, 20])).toBeUndefined();
    expect(parseOptionalInt('3.5', [1, 20])).toBeUndefined();
  });
  it('accepts signs and clamps to the range', () => {
    expect(parseOptionalInt('+3', [-10, 20])).toBe(3);
    expect(parseOptionalInt('-2', [-10, 20])).toBe(-2);
    expect(parseOptionalInt('25', [1, 20])).toBe(20);
    expect(parseOptionalInt('0', [1, 20])).toBe(1);
  });
});

describe('playerFromInput', () => {
  it('builds a player from form text', () => {
    expect(playerFromInput({ name: ' Aria ', level: '5', initiativeBonus: '+3', passivePerception: '14' })).toEqual({
      name: 'Aria',
      level: 5,
      initiativeBonus: 3,
      passivePerception: 14,
    });
  });
  it('defaults the initiative bonus to 0 and leaves optional fields unset', () => {
    expect(playerFromInput({ name: 'Brom', level: '', initiativeBonus: '', passivePerception: '' })).toEqual({
      name: 'Brom',
      level: undefined,
      initiativeBonus: 0,
      passivePerception: undefined,
    });
  });
  it('requires a name', () => {
    expect(playerFromInput({ name: '  ', level: '3', initiativeBonus: '', passivePerception: '' })).toBeNull();
  });
});

describe('duplicatePlayerNames', () => {
  it('finds case-insensitive clashes', () => {
    expect(duplicatePlayerNames([{ name: 'Aria' }, { name: 'aria ' }, { name: 'Brom' }])).toEqual(new Set(['aria']));
  });
});

describe('partySummary', () => {
  it('sums thresholds over players with a level', () => {
    const s = partySummary([{ level: 1 }, { level: 1 }, { level: 3 }, {}]);
    expect(s).toEqual({
      levelled: 3,
      missingLevel: 1,
      averageLevel: 5 / 3,
      thresholds: [25 + 25 + 75, 50 + 50 + 150, 75 + 75 + 225, 100 + 100 + 400],
    });
  });
  it('handles an empty party', () => {
    expect(partySummary([])).toMatchObject({ levelled: 0, averageLevel: null, thresholds: [0, 0, 0, 0] });
  });
});
