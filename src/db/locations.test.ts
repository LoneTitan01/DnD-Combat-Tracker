import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackerDB, deleteLocation, localSyncData, saveLocation } from '.';
import { blankLocation } from '../logic';

let n = 0;
let open: TrackerDB | undefined;
afterEach(async () => {
  await open?.delete();
});

describe('locations', () => {
  it('saves links on both sides and cleans up after a delete', async () => {
    open = new TrackerDB(`locations-${++n}`);
    const town = { ...blankLocation('c'), id: 'town', name: 'Leilon' };
    const shop = { ...blankLocation('c'), id: 'shop', name: "Aubrey's" };
    const other = { ...blankLocation('other'), id: 'far', name: 'Elsewhere' };
    await saveLocation(shop, [], open);
    await saveLocation(other, [], open);
    await saveLocation({ ...town, siblingIds: ['far'] }, ['shop'], open);

    expect((await open.locations.get('shop'))?.parentId).toBe('town');
    // Links only reach locations in the same campaign.
    expect((await open.locations.get('far'))?.siblingIds).toEqual([]);

    await deleteLocation('town', open);
    expect(await open.locations.get('town')).toBeUndefined();
    expect((await open.locations.get('shop'))?.parentId).toBeUndefined();
    const sync = await localSyncData(open);
    expect(sync.locations.map((l) => l.id).sort()).toEqual(['far', 'shop']);
    expect(sync.deletions).toMatchObject([{ table: 'locations', id: 'town' }]);
  });
});
