import { describe, expect, it } from 'vitest';
import type { Spell } from '../models';
import { blankSpell, normalizeSpell, spellSubtitle, splitSpellMentions, suggestedSpells, unmentionedSpells } from './spells';
import { makeTemplate } from './testUtils';

const spell = (name: string, patch: Partial<Spell> = {}): Spell => ({ ...blankSpell(), id: name, name, ...patch });

describe('splitSpellMentions', () => {
  const spells = [spell('Fireball'), spell('Invisibility'), spell('Greater Invisibility'), spell('Hold Person')];

  it('marks whole-word mentions in any case and keeps the rest as text', () => {
    const parts = splitSpellMentions('3rd level (3 slots): fireball, hold person', spells);
    expect(parts).toEqual([
      '3rd level (3 slots): ',
      { text: 'fireball', spell: spells[0] },
      ', ',
      { text: 'hold person', spell: spells[3] },
    ]);
  });

  it('prefers the longest name and ignores names inside other words', () => {
    const parts = splitSpellMentions('greater invisibility; fireballs', spells);
    expect(parts).toEqual([{ text: 'greater invisibility', spell: spells[2] }, '; fireballs']);
  });

  it('handles names with regex characters and no spells', () => {
    const odd = spell("Tasha's Hideous Laughter (2014)");
    expect(splitSpellMentions("casts tasha's hideous laughter (2014).", [odd])[1]).toEqual({
      text: "tasha's hideous laughter (2014)",
      spell: odd,
    });
    expect(splitSpellMentions('plain', [])).toEqual(['plain']);
    expect(splitSpellMentions('', spells)).toEqual([]);
  });
});

describe('linking to stat blocks', () => {
  const fireball = spell('Fireball');
  const shield = spell('Shield', { level: 1 });
  const mage = makeTemplate({
    traits: [{ id: 't', name: 'Spellcasting', description: 'At will: fireball' }],
    spellIds: ['Fireball', 'Shield'],
  });

  it('lists linked spells the text never names', () => {
    expect(unmentionedSpells(mage, [fireball, shield])).toEqual([shield]);
  });

  it('suggests unlinked spells the text names', () => {
    expect(suggestedSpells({ ...mage, spellIds: [] }, [fireball, shield])).toEqual([fireball]);
    expect(suggestedSpells(mage, [fireball, shield])).toEqual([]);
  });
});

describe('spellSubtitle', () => {
  it('prints levels, cantrips and rituals', () => {
    expect(spellSubtitle(spell('x', { level: 3, school: 'evocation' }))).toBe('3rd-level evocation');
    expect(spellSubtitle(spell('x', { level: 0, school: 'conjuration' }))).toBe('Conjuration cantrip');
    expect(spellSubtitle(spell('x', { level: 1, school: 'divination', ritual: true }))).toBe('1st-level divination (ritual)');
  });
});

describe('normalizeSpell', () => {
  it('reads 5e API style data', () => {
    const s = normalizeSpell({
      index: 'fireball',
      name: 'Fireball',
      desc: ['A bright streak…', 'The fire spreads…'],
      higher_level: ['+1d6 per slot level.'],
      range: '150 feet',
      components: ['V', 'S', 'M'],
      material: 'A tiny ball of bat guano and sulfur.',
      ritual: false,
      duration: 'Instantaneous',
      concentration: false,
      casting_time: '1 action',
      level: 3,
      school: { index: 'evocation', name: 'Evocation' },
    })!;
    expect(s).toMatchObject({
      name: 'Fireball',
      level: 3,
      school: 'evocation',
      castingTime: '1 action',
      components: 'V, S, M (A tiny ball of bat guano and sulfur)',
      description: 'A bright streak…\n\nThe fire spreads…',
      higherLevels: '+1d6 per slot level.',
      concentration: false,
    });
  });

  it('reads "yes"/"no" flags and cantrip levels as text', () => {
    const s = normalizeSpell({ name: 'Light', level: 'Cantrip', ritual: 'no', concentration: 'yes', school: 'Evocation' })!;
    expect(s).toMatchObject({ level: 0, ritual: false, concentration: true, school: 'evocation' });
  });

  it('skips entries without a name', () => {
    expect(normalizeSpell({ level: 1 })).toBeNull();
  });
});
