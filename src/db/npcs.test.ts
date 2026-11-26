import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackerDB, deleteLocation, localSyncData, saveLocation, saveNpc, setLocationNpcs } from '.';
import { blankLocation } from '../logic';

let n = 0;
let open: TrackerDB | undefined;
afterEach(async () => {
  open?.close();
  await open?.delete();
  open = undefined;
});

const byName = async (db: TrackerDB) => Object.fromEntries((await db.npcs.toArray()).map((x) => [x.name, x.locationId]));

describe('NPCs', () => {
  it('sets who lives at a location: moves listed NPCs in, others out, and creates new ones', async () => {
    open = new TrackerDB(`npcs-${++n}`);
    await saveLocation({ ...blankLocation('c'), id: 'town', name: 'Leilon' }, [], open);
    await saveLocation({ ...blankLocation('c'), id: 'nw', name: 'Neverwinter' }, [], open);
    await saveNpc({ id: 'tom', campaignId: 'c', name: 'Old Tom', locationId: 'town' }, open);
    await saveNpc({ id: 'sil', campaignId: 'c', name: 'Sildar', locationId: 'nw' }, open);
    await saveNpc({ id: 'far', campaignId: 'other', name: 'Elsewhere', locationId: 'town' }, open);

    await setLocationNpcs('town', 'c', ['sil'], ['Aubrey', '  '], open);
    expect(await byName(open)).toEqual({ 'Old Tom': undefined, Sildar: 'town', Aubrey: 'town', Elsewhere: 'town' });
    // Clearing the location drops the field instead of storing undefined.
    expect('locationId' in (await open.npcs.get('tom'))!).toBe(false);
  });

  it('NPCs at a deleted location move up to its parent', async () => {
    open = new TrackerDB(`npcs-${++n}`);
    await saveLocation({ ...blankLocation('c'), id: 'town', name: 'Leilon' }, [], open);
    await saveLocation({ ...blankLocation('c', 'town'), id: 'shop', name: "Aubrey's" }, [], open);
    await saveNpc({ id: 'a', campaignId: 'c', name: 'Aubrey', locationId: 'shop' }, open);

    await deleteLocation('shop', open);
    expect((await open.npcs.get('a'))?.locationId).toBe('town');
    await deleteLocation('town', open);
    expect((await open.npcs.get('a'))?.locationId).toBeUndefined();
    expect((await localSyncData(open)).npcs.map((x) => x.name)).toEqual(['Aubrey']);
  });

  it('upgrades NPC names listed on locations (v6) into NPC records', async () => {
    const name = `npcs-upgrade-${++n}`;
    const v6 = new Dexie(name);
    v6.version(6).stores({
      campaigns: 'id, name',
      creatures: 'id, name, type, cr, updatedAt',
      spells: 'id, name, level, updatedAt',
      players: 'id, name',
      locations: 'id, campaignId, parentId, name',
      encounters: 'id, name, *tags, updatedAt',
      combats: 'id, encounterId, status, updatedAt',
      deletions: 'key, table, deletedAt',
    });
    const base = { campaignId: 'c', siblingIds: [], notes: '', createdAt: 1, updatedAt: 7 };
    await v6.table('locations').bulkPut([
      { ...base, id: 'town', name: 'Leilon', npcs: ['Aubrey', 'Rhinehart'] },
      { ...base, id: 'shop', name: "Aubrey's", parentId: 'town', npcs: ['Aubrey'] },
    ]);
    v6.close();

    open = new TrackerDB(name);
    expect(await byName(open)).toEqual({ Aubrey: 'shop', Rhinehart: 'town' });
    const town = await open.locations.get('town');
    expect(town && 'npcs' in town).toBe(false);
    expect(town?.updatedAt).toBe(7);
  });
});
