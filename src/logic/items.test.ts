import { describe, expect, it } from 'vitest';
import type { Item } from '../models';
import {
  blankItem,
  costInCopper,
  filterItems,
  itemSubtitle,
  itemSummary,
  normalizeItem,
  validateItem,
  weightInPounds,
  withCategory,
  type ItemSort,
} from './items';

const item = (name: string, patch: Partial<Item> = {}): Item => ({ ...blankItem(), id: name, name, ...patch });

describe('cost and weight', () => {
  it('reads costs in any coin as copper', () => {
    expect(costInCopper('15 gp')).toBe(1500);
    expect(costInCopper('5 SP')).toBe(50);
    expect(costInCopper('1,500 gp')).toBe(150000);
    expect(costInCopper('2 pp')).toBe(2000);
    expect(costInCopper('a favour')).toBeUndefined();
    expect(costInCopper('')).toBeUndefined();
  });

  it('reads weights in pounds, fractions included', () => {
    expect(weightInPounds('3 lb.')).toBe(3);
    expect(weightInPounds('1/2 lb.')).toBe(0.5);
    expect(weightInPounds('1,000 lbs')).toBe(1000);
    expect(weightInPounds('4')).toBe(4);
    expect(weightInPounds('—')).toBeUndefined();
  });
});

describe('filterItems', () => {
  const list = [
    item('Longsword', { category: 'weapon', cost: '15 gp', weight: '3 lb.' }),
    item('Dagger', { category: 'weapon', cost: '2 gp', weight: '1 lb.' }),
    item('Chain Mail', { category: 'armor', cost: '75 gp', weight: '55 lb.' }),
    item('Rope', { category: 'gear', cost: '1 gp', weight: '10 lb.' }),
    item('Lute', { category: 'tool', cost: 'priceless', weight: '' }),
  ];
  const names = (sort?: ItemSort, desc?: boolean, extra = {}) => filterItems(list, { sort, desc, ...extra }).map((i) => i.name);

  it('filters by category and name', () => {
    expect(names(undefined, false, { category: 'weapon' })).toEqual(['Dagger', 'Longsword']);
    expect(names(undefined, false, { query: 'MAIL' })).toEqual(['Chain Mail']);
  });

  it('sorts by category in list order, then name', () => {
    expect(names('category')).toEqual(['Dagger', 'Longsword', 'Chain Mail', 'Lute', 'Rope']);
  });

  it('sorts by cost and weight, keeping unreadable ones last either way', () => {
    expect(names('cost')).toEqual(['Rope', 'Dagger', 'Longsword', 'Chain Mail', 'Lute']);
    expect(names('cost', true)).toEqual(['Chain Mail', 'Longsword', 'Dagger', 'Rope', 'Lute']);
    expect(names('weight', true)).toEqual(['Chain Mail', 'Rope', 'Longsword', 'Dagger', 'Lute']);
  });
});

describe('categories', () => {
  it('fills in details when switching category, and keeps the old ones', () => {
    const sword = withCategory(item('Sword'), 'weapon');
    expect(sword.weapon).toMatchObject({ class: 'simple', range: 'melee' });
    const armored = withCategory({ ...sword, weapon: { ...sword.weapon!, damage: '1d8' } }, 'armor');
    expect(armored.armor).toMatchObject({ type: 'light' });
    expect(withCategory(armored, 'weapon').weapon!.damage).toBe('1d8');
  });

  it('describes items as printed', () => {
    const sword = item('Longsword', {
      category: 'weapon',
      weapon: { class: 'martial', range: 'melee', damage: '1d8', damageType: 'slashing', properties: 'Versatile (1d10)' },
    });
    expect(itemSubtitle(sword)).toBe('Martial melee weapon');
    expect(itemSummary(sword)).toBe('1d8 slashing');
    const shield = item('Shield', { category: 'armor', armor: { type: 'shield', ac: '+2', strength: 0, stealthDisadvantage: false } });
    expect(itemSubtitle(shield)).toBe('Shield');
    expect(itemSummary(shield)).toBe('AC +2');
    expect(itemSubtitle(item('Dice', { category: 'tool', tool: { type: 'gaming' } }))).toBe('Gaming set');
    expect(itemSubtitle(item('Rope'))).toBe('Adventuring gear');
  });

  it('requires a name and a sensible strength requirement', () => {
    expect(validateItem(item(' '))).toEqual(['Name is required.']);
    expect(validateItem(item('Plate', { category: 'armor', armor: { type: 'heavy', ac: '18', strength: 40, stealthDisadvantage: true } }))).toHaveLength(1);
  });
});

describe('normalizeItem', () => {
  it('skips entries without a name and defaults to adventuring gear', () => {
    expect(normalizeItem({ cost: '1 gp' })).toBeNull();
    expect(normalizeItem({ name: 'Torch', cost: '1 cp', weight: 1 })).toMatchObject({ category: 'gear', cost: '1 cp', weight: '1 lb.' });
  });

  it('keeps its own format', () => {
    const own = item('Pike', {
      category: 'weapon',
      weapon: { class: 'martial', range: 'melee', damage: '1d10', damageType: 'piercing', properties: 'Heavy, reach, two-handed' },
    });
    expect(normalizeItem(JSON.parse(JSON.stringify(own)))).toEqual(own);
  });

  it('reads the public 5e equipment shape', () => {
    expect(
      normalizeItem({
        name: 'Longsword',
        equipment_category: { name: 'Weapon' },
        weapon_category: 'Martial',
        weapon_range: 'Melee',
        cost: { quantity: 15, unit: 'gp' },
        weight: 3,
        damage: { damage_dice: '1d8', damage_type: { name: 'Slashing' } },
        properties: [{ name: 'Versatile' }],
      }),
    ).toMatchObject({
      category: 'weapon',
      cost: '15 gp',
      weight: '3 lb.',
      weapon: { class: 'martial', range: 'melee', damage: '1d8', damageType: 'slashing', properties: 'Versatile' },
    });
    expect(
      normalizeItem({
        name: 'Half Plate',
        equipment_category: { name: 'Armor' },
        armor_category: 'Medium',
        armor_class: { base: 15, dex_bonus: true, max_bonus: 2 },
        str_minimum: 0,
        stealth_disadvantage: true,
      })!.armor,
    ).toEqual({ type: 'medium', ac: '15 + Dex modifier (max 2)', strength: 0, stealthDisadvantage: true });
    expect(normalizeItem({ name: 'Shield', armor_category: 'Shield', armor_class: { base: 2, dex_bonus: false } })!.armor!.ac).toBe('+2');
    expect(
      normalizeItem({ name: 'Lute', equipment_category: { name: 'Tools' }, tool_category: 'Musical Instrument', desc: ['A lute.'] }),
    ).toMatchObject({ category: 'tool', tool: { type: 'musical' }, description: 'A lute.' });
  });
});
