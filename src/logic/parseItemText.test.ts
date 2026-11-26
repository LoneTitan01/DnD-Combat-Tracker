import { describe, expect, it } from 'vitest';
import { parseItemText, splitItemText } from './parseItemText';

describe('parseItemText', () => {
  it('reads a described weapon', () => {
    const { value, warnings, question } = parseItemText(`Longsword
Martial Melee Weapon
Cost: 15 gp
Weight: 3 lb.
Damage: 1d8 slashing
Properties: Versatile (1d10)
Proficiency with a longsword allows you to add your proficiency bonus.`);
    expect(question).toBeUndefined();
    expect(warnings).toEqual([]);
    expect(value).toMatchObject({
      name: 'Longsword',
      category: 'weapon',
      cost: '15 gp',
      weight: '3 lb.',
      weapon: { class: 'martial', range: 'melee', damage: '1d8', damageType: 'slashing', properties: 'Versatile (1d10)' },
      description: 'Proficiency with a longsword allows you to add your proficiency bonus.',
    });
  });

  it('reads the 2024 layout, keeping the mastery in the description', () => {
    const { value, question } = parseItemText(`Rapier
Weapon (Rapier)
Damage: 1d8 Piercing
Properties: Finesse
Mastery: Vex
Weight: 2 lb.
Cost: 25 GP`);
    expect(question).toBeUndefined();
    expect(value.category).toBe('weapon');
    expect(value.weapon).toMatchObject({ class: 'martial', range: 'melee', damage: '1d8', damageType: 'piercing' });
    expect(value.cost).toBe('25 gp');
    expect(value.description).toBe('Mastery: Vex');
  });

  it('reads a weapon table row and knows a weapon by its damage', () => {
    const { value, question } = parseItemText('Crossbow, light 25 gp 1d8 piercing 5 lb. Ammunition (range 80/320), loading, two-handed');
    expect(question).toBeUndefined();
    expect(value).toMatchObject({ name: 'Crossbow, light', category: 'weapon', cost: '25 gp', weight: '5 lb.' });
    expect(value.weapon).toMatchObject({
      class: 'simple',
      range: 'ranged',
      damage: '1d8',
      damageType: 'piercing',
      properties: 'Ammunition (range 80/320), loading, two-handed',
    });
  });

  it('reads a 2024 weapon row with the cost last and a mastery', () => {
    const { value } = parseItemText('Club 1d4 Bludgeoning Light Slow 2 lb. 1 SP');
    expect(value).toMatchObject({ name: 'Club', category: 'weapon', cost: '1 sp', weight: '2 lb.' });
    expect(value.weapon).toMatchObject({ damage: '1d4', damageType: 'bludgeoning', properties: 'Light' });
    expect(value.description).toBe('Mastery: Slow');
  });

  it('reads armor rows and works out the armor type', () => {
    expect(parseItemText('Chain mail 75 gp 16 Str 13 Disadvantage 55 lb.').value).toMatchObject({
      category: 'armor',
      cost: '75 gp',
      weight: '55 lb.',
      armor: { type: 'heavy', ac: '16', strength: 13, stealthDisadvantage: true },
    });
    expect(parseItemText('Hide 10 gp 12 + Dex modifier (max 2) — 12 lb.').value.armor).toMatchObject({
      type: 'medium',
      ac: '12 + Dex modifier (max 2)',
      stealthDisadvantage: false,
    });
    expect(parseItemText('Shield 10 gp +2 — 6 lb.').value.armor).toMatchObject({ type: 'shield', ac: '+2' });
    // An unknown name: the Dex bonus without a cap makes it light armor.
    expect(parseItemText('Drakehide Jerkin 50 gp 12 + Dex modifier 8 lb.').value).toMatchObject({
      category: 'armor',
      armor: { type: 'light', ac: '12 + Dex modifier' },
    });
  });

  it('reads described armor', () => {
    const { value, question } = parseItemText(`Mithral Breastplate
Medium Armor
Armor Class: 14 + Dex (max 2)
Stealth: —
Cost: 800 gp`);
    expect(question).toBeUndefined();
    expect(value.armor).toMatchObject({ type: 'medium', ac: '14 + Dex modifier (max 2)', stealthDisadvantage: false });
  });

  it('knows tools by name', () => {
    expect(parseItemText("Smith's tools 20 gp 8 lb.").value).toMatchObject({ category: 'tool', tool: { type: 'artisan' } });
    expect(parseItemText('Lute 35 gp 2 lb.').value).toMatchObject({ category: 'tool', tool: { type: 'musical' } });
    expect(parseItemText('Dice set 1 sp —').value).toMatchObject({ category: 'tool', tool: { type: 'gaming' } });
    expect(parseItemText("Thieves' tools 25 gp 1 lb.").value).toMatchObject({ category: 'tool', tool: { type: 'other' } });
  });

  it('takes the kind from a "Type:" line', () => {
    const { value, question } = parseItemText('Torch 1 cp 1 lb.\nType: Adventuring Gear');
    expect(question).toBeUndefined();
    expect(value).toMatchObject({ name: 'Torch', category: 'gear', cost: '1 cp', weight: '1 lb.' });
  });

  it('asks when the text gives no clue, and the answer sets the category', () => {
    const { value, question } = parseItemText(`Rope, hempen (50 feet)
1 gp, 10 lb.
Rope has 2 hit points and can be burst with a DC 17 Strength check.`);
    expect(question?.prompt).toBe('What kind of item is Rope, hempen (50 feet)?');
    expect(value).toMatchObject({ cost: '1 gp', weight: '10 lb.', description: 'Rope has 2 hit points and can be burst with a DC 17 Strength check.' });
    expect(question?.choices.map((c) => c.label)).toEqual(['Weapon', 'Armor', 'Tool', 'Adventuring gear']);
    const answered = question!.choices[3]!.apply(value);
    expect(answered.category).toBe('gear');
    expect(question!.answeredBy!(value, { ...value, category: 'tool' })).toBe(true);
    expect(question!.answeredBy!(value, { ...value, name: 'Rope' })).toBe(false);
  });

  it('asks when the clues disagree, keeping the details of each', () => {
    const { value, question } = parseItemText(`Spiked Pauldron
Damage: 1d4 piercing
Armor Class: +1`);
    expect(question?.detail).toBe('It looks like it could be weapon or armor.');
    expect(value.weapon?.damage).toBe('1d4');
    expect(question!.choices[1]!.apply(value).armor).toMatchObject({ ac: '+1' });
  });

  it('asks when a heading disagrees with the row', () => {
    const { value, question } = parseItemText('Chain mail 75 gp 16 Str 13 Disadvantage 55 lb.\nType: Martial Melee Weapons');
    expect(question?.detail).toBe('The text says weapon, but it looks like armor.');
    expect(question!.choices[1]!.apply(value).armor).toMatchObject({ type: 'heavy', ac: '16', strength: 13 });
  });

  it('warns when it is empty', () => {
    expect(parseItemText('  ').warnings).toEqual(['Nothing to read: the text is empty.']);
  });
});

describe('splitItemText', () => {
  it('splits a table into rows, carrying section headings as the type', () => {
    const rows = splitItemText(`Name Cost Damage Weight Properties
Simple Melee Weapons
Club 1 sp 1d4 bludgeoning 2 lb. Light
Dagger 2 gp 1d4 piercing 1 lb. Finesse, light, thrown (range 20/60)
Martial Ranged Weapons
Longbow 50 gp 1d8 piercing 2 lb. Ammunition (range 150/600), heavy,
two-handed`);
    expect(rows).toEqual([
      'Club 1 sp 1d4 bludgeoning 2 lb. Light\nType: Simple Melee Weapons',
      'Dagger 2 gp 1d4 piercing 1 lb. Finesse, light, thrown (range 20/60)\nType: Simple Melee Weapons',
      'Longbow 50 gp 1d8 piercing 2 lb. Ammunition (range 150/600), heavy, two-handed\nType: Martial Ranged Weapons',
    ]);
    expect(parseItemText(rows[2]!).value.weapon).toMatchObject({
      class: 'martial',
      range: 'ranged',
      properties: 'Ammunition (range 150/600), heavy, two-handed',
    });
  });

  it('leaves a single described item whole', () => {
    const text = `Longsword
Martial Melee Weapon
Cost: 15 gp
Damage: 1d8 slashing`;
    expect(splitItemText(text)).toEqual([text]);
    const prose = `Bag of Tricks 50 gp 1 lb.
This ordinary bag, made from gray, rust, or tan cloth, appears empty. Reaching inside the bag, however, reveals the presence of a small, fuzzy object.`;
    expect(splitItemText(prose)).toEqual([prose]);
  });

  it('splits a gear list without headings', () => {
    expect(splitItemText('Torch 1 cp 1 lb.\nBedroll 1 gp 7 lb.\nWaterskin 2 sp 5 lb. (full)')).toHaveLength(3);
  });
});
