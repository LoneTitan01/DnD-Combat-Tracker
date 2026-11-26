import { describe, expect, it } from 'vitest';
import type { Item, Location } from '../models';
import { blankItem } from './items';
import {
  ancestorsOf,
  childOptions,
  cleanLocation,
  filterLocations,
  itemsToStock,
  parsePriceBound,
  shopKindOf,
  locationTree,
  parentOptions,
  planLocationDelete,
  needsRestock,
  parseStock,
  planLocationSave,
  restockShop,
  sellOne,
  shopItemFor,
  shopOnlyItem,
  siblingsOf,
  stockLabel,
  validateLocation,
} from './locations';

const loc = (id: string, name: string, patch: Partial<Location> = {}): Location => ({
  id,
  campaignId: 'c',
  name,
  siblingIds: [],
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  ...patch,
});

// Sword Coast › Leilon › (Aubrey's, Inn); Neverwinter is top-level and linked to Leilon.
const coast = loc('coast', 'Sword Coast');
const leilon = loc('leilon', 'Leilon', { parentId: 'coast', siblingIds: ['nw'] });
const shop = loc('shop', "Aubrey's Peculiarities Shoppe", { parentId: 'leilon' });
const inn = loc('inn', 'Inn', { parentId: 'leilon', notes: 'Rooms upstairs' });
const nw = loc('nw', 'Neverwinter', { siblingIds: ['leilon'] });
const all = [coast, leilon, shop, inn, nw];
const names = (list: { name: string }[]) => list.map((l) => l.name);

describe('location hierarchy', () => {
  it('lists ancestors outermost first, and survives loops', () => {
    expect(names(ancestorsOf(all, shop))).toEqual(['Sword Coast', 'Leilon']);
    const a = loc('a', 'A', { parentId: 'b' });
    const b = loc('b', 'B', { parentId: 'a' });
    expect(names(ancestorsOf([a, b], a))).toEqual(['B']);
  });

  it('builds an outline with depths', () => {
    expect(locationTree(all).map((r) => `${r.depth}:${r.location.name}`)).toEqual([
      '0:Neverwinter',
      '0:Sword Coast',
      '1:Leilon',
      "2:Aubrey's Peculiarities Shoppe",
      '2:Inn',
    ]);
  });

  it('keeps places in a loop or with a missing parent in the outline', () => {
    const a = loc('a', 'A', { parentId: 'b' });
    const b = loc('b', 'B', { parentId: 'a' });
    const orphan = loc('o', 'Orphan', { parentId: 'gone' });
    expect(locationTree([a, b, orphan]).map((r) => r.location.name).sort()).toEqual(['A', 'B', 'Orphan']);
  });

  it('only offers parents and children that keep the outline a tree', () => {
    expect(names(parentOptions(all, 'leilon'))).toEqual(['Neverwinter', 'Sword Coast']);
    expect(names(childOptions(all, leilon))).toEqual(["Aubrey's Peculiarities Shoppe", 'Inn', 'Neverwinter']);
    expect(validateLocation({ ...coast, parentId: 'shop' }, all)).toEqual(["A location can't be inside a place that's inside it."]);
    expect(validateLocation({ ...coast, name: ' ' }, all)).toEqual(['Give the location a name.']);
  });
});

describe('siblingsOf', () => {
  it('includes places sharing a parent and links from either side', () => {
    expect(siblingsOf(all, shop).map((s) => [s.location.name, s.linked])).toEqual([['Inn', false]]);
    expect(siblingsOf(all, nw).map((s) => [s.location.name, s.linked])).toEqual([['Leilon', true]]);
    const oneSided = [loc('x', 'X', { siblingIds: ['y'] }), loc('y', 'Y')];
    expect(names(siblingsOf(oneSided, oneSided[1]!).map((s) => s.location))).toEqual(['X']);
  });
});

describe('filterLocations', () => {
  it('matches names, notes and NPCs', () => {
    expect(names(filterLocations(all, 'aubrey'))).toEqual(["Aubrey's Peculiarities Shoppe"]);
    const npcs = [{ name: 'Bo', locationId: 'inn' }, { name: 'Bob', locationId: undefined }];
    expect(names(filterLocations(all, 'bo', npcs))).toEqual(['Inn']);
    expect(names(filterLocations(all, 'upstairs'))).toEqual(['Inn']);
  });

  it('matches shop items', () => {
    const stocked = { ...shop, shop: [{ id: 'i', name: 'Potion of Healing', cost: '50 gp', description: '' }] };
    expect(names(filterLocations([stocked, inn], 'potion'))).toEqual(["Aubrey's Peculiarities Shoppe"]);
  });
});

describe('shop items', () => {
  let n = 0;
  const item = (name: string, cost = '', description = '') => ({ id: `i${++n}`, name, cost, description });

  it('trims items and drops blank rows', () => {
    const rope = item(' Rope ', ' 1 gp ', ' 50 ft ');
    const cleaned = cleanLocation({ ...shop, shop: [rope, item('', ' ', '')] });
    expect(cleaned.shop).toEqual([{ id: rope.id, name: 'Rope', cost: '1 gp', description: '50 ft' }]);
  });

  it('leaves no shop when nothing is for sale', () => {
    expect(cleanLocation({ ...shop, shop: [item('')] })).not.toHaveProperty('shop');
  });

  it('starts items from the item list at their list price, and keeps them on save', () => {
    const row = shopItemFor({ id: 'sword', name: 'Longsword', cost: '15 gp' });
    expect(row).toMatchObject({ itemId: 'sword', name: 'Longsword', cost: '15 gp', description: '' });
    // A listed item stays even with its price cleared: it's for sale, price to be haggled.
    expect(cleanLocation({ ...shop, shop: [{ ...row, name: '', cost: '' }] }).shop).toHaveLength(1);
  });

  it('keeps whole, non-negative stock counts and drops the rest', () => {
    const rope = { ...item('Rope'), stock: 2.7, maxStock: -1 };
    expect(cleanLocation({ ...shop, shop: [rope] }).shop).toEqual([{ id: rope.id, name: 'Rope', cost: '', description: '', stock: 2 }]);
    // A row with only a stock count isn't blank, so it needs a name.
    expect(validateLocation({ ...shop, shop: [{ ...item(''), stock: 3 }] }, all)).toContain('Give every shop item a name.');
  });

  it('reads stock boxes as whole numbers from 0', () => {
    expect(parseStock('')).toBeUndefined();
    expect(parseStock(' 4 ')).toBe(4);
    expect(parseStock('2.9')).toBe(2);
    expect(parseStock('-3')).toBe(0);
    expect(parseStock('lots')).toBeUndefined();
  });

  it('labels stock and restocks items with a maximum', () => {
    expect(stockLabel({})).toBe('');
    expect(stockLabel({ stock: 3 })).toBe('3');
    expect(stockLabel({ stock: 1, maxStock: 5 })).toBe('1 / 5');
    expect(stockLabel({ maxStock: 5 })).toBe('– / 5');
    const rows = [
      { ...item('Rope'), stock: 1, maxStock: 5 },
      { ...item('Potion'), maxStock: 2 },
      { ...item('Sword'), stock: 1 },
      item('Map'),
    ];
    expect(needsRestock(rows)).toBe(true);
    const restocked = restockShop(rows);
    expect(restocked.map((r) => r.stock)).toEqual([5, 2, 1, undefined]);
    expect(needsRestock(restocked)).toBe(false);
    expect(needsRestock([rows[2]!, rows[3]!])).toBe(false);
  });

  it('makes shop-only items, not tied to the item list', () => {
    const scroll = shopOnlyItem('Scroll of Mending');
    expect(scroll).toEqual({ id: scroll.id, name: 'Scroll of Mending', cost: '', description: '' });
    expect(scroll).not.toHaveProperty('itemId');
  });

  it('sells one at a time, never below 0, and only counted items', () => {
    const rows = [{ ...item('Rope'), stock: 1 }, item('Map')];
    const once = sellOne(rows, rows[0]!.id);
    expect(once[0]?.stock).toBe(0);
    expect(sellOne(once, rows[0]!.id)[0]?.stock).toBe(0);
    expect(sellOne(rows, rows[1]!.id)[1]).toBe(rows[1]);
  });

  it('needs a name on every filled-in item', () => {
    expect(validateLocation({ ...shop, shop: [item('', '5 gp')] }, all)).toContain('Give every shop item a name.');
    expect(validateLocation({ ...shop, shop: [item(''), item('Rope')] }, all)).toEqual([]);
  });
});

describe('planLocationSave', () => {
  it('cleans the location', () => {
    expect(cleanLocation({ ...shop, name: ' Shop ', siblingIds: ['inn', 'inn', 'shop'] })).toMatchObject({
      name: 'Shop',
      siblingIds: ['inn'],
    });
  });

  it('adopts and releases children', () => {
    // Neverwinter moves inside Leilon; the inn is dropped and moves up to the Sword Coast.
    const out = planLocationSave(all, leilon, ['shop', 'nw']);
    const byId = new Map(out.map((l) => [l.id, l]));
    expect(byId.get('nw')?.parentId).toBe('leilon');
    expect(byId.get('inn')?.parentId).toBe('coast');
    expect(byId.has('shop')).toBe(false); // unchanged
  });

  it('keeps sibling links on both sides', () => {
    const out = planLocationSave(all, { ...leilon, siblingIds: ['inn'] }, ['shop', 'inn']);
    const byId = new Map(out.map((l) => [l.id, l]));
    expect(byId.get('inn')?.siblingIds).toEqual(['leilon']);
    expect(byId.get('nw')?.siblingIds).toEqual([]);
  });

  it('a new location saves just itself unless it links others', () => {
    expect(planLocationSave(all, loc('new', 'Docks', { parentId: 'leilon' }), [])).toHaveLength(1);
  });
});

describe('planLocationDelete', () => {
  it('moves children up and drops links', () => {
    const out = planLocationDelete(all, 'leilon');
    const byId = new Map(out.map((l) => [l.id, l]));
    expect(byId.get('shop')?.parentId).toBe('coast');
    expect(byId.get('inn')?.parentId).toBe('coast');
    expect(byId.get('nw')?.siblingIds).toEqual([]);
    expect(byId.has('coast')).toBe(false);
  });

  it('children of a top-level place become top-level', () => {
    const out = planLocationDelete(all, 'coast');
    expect(out).toHaveLength(1);
    expect('parentId' in out[0]!).toBe(false);
  });
});

describe('stocking a shop in bulk', () => {
  const item = (id: string, name: string, cost: string, patch: Partial<Item> = {}): Item => ({
    ...blankItem(patch.category),
    ...patch,
    id,
    name,
    cost,
  });
  const catalog = [
    item('lute', 'Lute', '35 gp', { category: 'tool', tool: { type: 'musical' } }),
    item('flute', 'Flute', '2 gp', { category: 'tool', tool: { type: 'musical' } }),
    item('thieves', "Thieves' Tools", '25 gp', { category: 'tool', tool: { type: 'other' } }),
    item('smith', "Smith's Tools", '20 gp', { category: 'tool', tool: { type: 'artisan' } }),
    item('dice', 'Dice Set', '1 sp', { category: 'tool', tool: { type: 'gaming' } }),
    item('rope', 'Rope', '1 gp'),
    item('odd', 'Odd Trinket', ''),
    item('dagger', 'Dagger', '2 gp', { category: 'weapon' }),
    item('whip', 'Whip', '2 gp', {
      category: 'weapon',
      weapon: { class: 'martial', range: 'melee', damage: '1d4', damageType: 'slashing', properties: '' },
    }),
    item('pipes', 'Pipes of Haunting', '6 gp', {
      category: 'tool',
      tool: { type: 'musical' },
      magic: { rarity: 'uncommon', attunement: false, attunementBy: '', bonus: 0, effects: [] },
    }),
  ];
  const names = (list: Item[]) => list.map((i) => i.name);

  it('reads price bounds as gold unless a coin is given', () => {
    expect(parsePriceBound('')).toBeUndefined();
    expect(parsePriceBound(' 25 ')).toBe(2500);
    expect(parsePriceBound('1,500')).toBe(150000);
    expect(parsePriceBound('5 sp')).toBe(50);
    expect(parsePriceBound('lots')).toBeNaN();
  });

  it('knows the kind of each item', () => {
    expect(catalog.map(shopKindOf)).toEqual([
      'tool:musical',
      'tool:musical',
      'tool:other',
      'tool:artisan',
      'tool:gaming',
      'gear',
      'gear',
      'weapon:simple',
      'weapon:martial',
      'tool:musical',
    ]);
  });

  it('picks the kinds asked for within a price range, in kind then price order', () => {
    const tools = ['tool:artisan', 'tool:gaming', 'tool:musical', 'tool:other'];
    expect(names(itemsToStock(catalog, [], { kinds: tools, maxCost: 2500 }))).toEqual([
      "Smith's Tools",
      'Dice Set',
      'Flute',
      "Thieves' Tools",
    ]);
    expect(names(itemsToStock(catalog, [], { kinds: ['tool:musical'], minCost: 500 }))).toEqual(['Lute']);
    expect(names(itemsToStock(catalog, [], { kinds: ['weapon:simple'] }))).toEqual(['Dagger']);
  });

  it('takes every kind when none is picked, and leaves out unpriced items only when filtering by price', () => {
    expect(itemsToStock(catalog, [], { kinds: [] })).toHaveLength(9);
    expect(names(itemsToStock(catalog, [], { kinds: ['gear'] }))).toEqual(['Rope', 'Odd Trinket']);
    expect(names(itemsToStock(catalog, [], { kinds: ['gear'], maxCost: 10000 }))).toEqual(['Rope']);
  });

  it('includes magic items only when asked, and skips what the shop already sells', () => {
    expect(names(itemsToStock(catalog, [], { kinds: ['tool:musical'], magic: true }))).toEqual([
      'Flute',
      'Pipes of Haunting',
      'Lute',
    ]);
    const shop = [shopItemFor(catalog[1]!)];
    expect(names(itemsToStock(catalog, shop, { kinds: ['tool:musical'] }))).toEqual(['Lute']);
  });
});
