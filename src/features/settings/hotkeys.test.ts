import { describe, expect, it } from 'vitest';
import { DEFAULT_HOTKEYS, ariaKey, conflictFor, isBindable, keyLabel, normalizeKey, parseHotkeys } from './hotkeys';

describe('hotkeys', () => {
  it('falls back to defaults for missing, corrupt or unusable values', () => {
    expect(parseHotkeys(null)).toEqual(DEFAULT_HOTKEYS);
    expect(parseHotkeys('not json')).toEqual(DEFAULT_HOTKEYS);
    expect(parseHotkeys(JSON.stringify({ nextTurn: 'Tab', multiTarget: 5, bogus: 'x' }))).toEqual(DEFAULT_HOTKEYS);
  });

  it('keeps saved keys, lower-casing letters', () => {
    expect(parseHotkeys(JSON.stringify({ nextTurn: 'T', close: 'q' }))).toEqual({ ...DEFAULT_HOTKEYS, nextTurn: 't', close: 'q' });
  });

  it('only reports conflicts within the same scope', () => {
    expect(conflictFor(DEFAULT_HOTKEYS, 'nextTurn', 'm')).toBe('multiTarget');
    expect(conflictFor(DEFAULT_HOTKEYS, 'nextTurn', 'n')).toBeNull();
    expect(conflictFor(DEFAULT_HOTKEYS, 'nextTurn', 'ArrowLeft')).toBeNull();
    expect(conflictFor(DEFAULT_HOTKEYS, 'bulkNext', 'ArrowLeft')).toBe('bulkPrev');
  });

  it('labels and filters keys', () => {
    expect(keyLabel('n')).toBe('N');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel(' ')).toBe('Space');
    expect(ariaKey(' ')).toBe('Space');
    expect(normalizeKey('N')).toBe('n');
    expect(isBindable('Shift')).toBe(false);
    expect(isBindable('Enter')).toBe(false);
    expect(isBindable('F2')).toBe(true);
  });
});
