import { describe, expect, it } from 'vitest';
import type { Location } from '../models';
import { filterNpcs, findNpcByName, npcsAt, npcsFromLegacyLocations, placeLabel, placeOptions } from './npcs';

const loc = (id: string, name: string, parentId?: string): Location => ({
  id,
  campaignId: 'c',
  name,
  ...(parentId ? { parentId } : {}),
  siblingIds: [],
  notes: '',
  createdAt: 0,
  updatedAt: 0,
});
const leilon = loc('leilon', 'Leilon');
const shop = loc('shop', "Aubrey's Shoppe", 'leilon');
const nw = loc('nw', 'Neverwinter');
const places = [shop, nw, leilon];

const npcs = [
  { id: 'a', name: 'Aubrey', locationId: 'shop' },
  { id: 's', name: 'Sildar', locationId: 'nw' },
  { id: 'r', name: 'Rhinehart', locationId: 'leilon' },
  { id: 'x', name: 'Stranger' },
];

describe('placeLabel / placeOptions', () => {
  it('names a location with the places it is inside', () => {
    expect(placeLabel(places, 'shop')).toBe("Leilon › Aubrey's Shoppe");
    expect(placeLabel(places, undefined)).toBe('');
    expect(placeLabel(places, 'gone')).toBe('');
  });
  it('lists locations in outline order', () => {
    expect(placeOptions(places).map((p) => p.label)).toEqual(['Leilon', "Leilon › Aubrey's Shoppe", 'Neverwinter']);
  });
});

describe('npcsAt / findNpcByName', () => {
  it('finds the NPCs living at one place only', () => {
    expect(npcsAt(npcs, 'leilon').map((n) => n.name)).toEqual(['Rhinehart']);
  });
  it('matches names ignoring case and spaces', () => {
    expect(findNpcByName(npcs, '  aubrey ')?.id).toBe('a');
    expect(findNpcByName(npcs, 'Nobody')).toBeUndefined();
    expect(findNpcByName(npcs, '  ')).toBeUndefined();
  });
});

describe('filterNpcs', () => {
  it('matches the name or any part of where they live', () => {
    expect(filterNpcs(npcs, 'SIL', places).map((n) => n.id)).toEqual(['s']);
    // Aubrey's shop is inside Leilon, so she counts as living in Leilon too.
    expect(filterNpcs(npcs, 'leilon', places).map((n) => n.id)).toEqual(['a', 'r']);
  });
  it('returns everyone for a blank search', () => {
    expect(filterNpcs(npcs, '  ', places)).toHaveLength(4);
  });
});

describe('npcsFromLegacyLocations', () => {
  it('makes one NPC per name, at the most deeply nested place that listed them', () => {
    const old = [
      { ...leilon, npcs: ['Aubrey', 'Rhinehart', ' '] },
      { ...shop, npcs: [' aubrey '] },
      { ...nw, npcs: ['Sildar'] },
    ];
    const made = npcsFromLegacyLocations(old);
    expect(made.map((n) => [n.name, n.locationId]).sort()).toEqual([
      ['Rhinehart', 'leilon'],
      ['Sildar', 'nw'],
      ['aubrey', 'shop'],
    ]);
    // Same ids every time, so two devices upgrading separately agree.
    expect(npcsFromLegacyLocations(old)).toEqual(made);
    expect(made.every((n) => n.updatedAt === 0 && n.campaignId === 'c')).toBe(true);
  });
  it('ignores locations without a list', () => {
    expect(npcsFromLegacyLocations(places)).toEqual([]);
  });
});
