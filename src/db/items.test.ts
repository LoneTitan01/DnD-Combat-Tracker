import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackerDB, deleteItem, exportItems, importItems, localSyncData, saveItem } from '.';
import { blankItem } from '../logic';

let n = 0;
let open: TrackerDB | undefined;
afterEach(async () => {
  open?.close();
  await open?.delete();
  open = undefined;
});

describe('items', () => {
  it('saves, syncs and deletes items, remembering the deletion', async () => {
    open = new TrackerDB(`items-${++n}`);
    await saveItem({ ...blankItem('weapon'), id: 'sword', name: 'Longsword' }, open);
    await saveItem({ ...blankItem(), id: 'rope', name: 'Rope' }, open);
    expect((await localSyncData(open)).items.map((i) => i.name).sort()).toEqual(['Longsword', 'Rope']);

    await deleteItem('rope', open);
    const data = await localSyncData(open);
    expect(data.items.map((i) => i.id)).toEqual(['sword']);
    expect(data.deletions).toMatchObject([{ table: 'items', id: 'rope' }]);
  });

  it('imports an export, a bare list or an API results list, replacing by id', async () => {
    open = new TrackerDB(`items-${++n}`);
    await saveItem({ ...blankItem(), id: 'rope', name: 'Rope' }, open);
    const backup = await exportItems(undefined, open);
    expect(await importItems(backup, open)).toEqual({ added: 0, replaced: 1, skipped: 0 });
    expect(await importItems([{ name: 'Torch' }, { cost: '1 gp' }], open)).toEqual({ added: 1, replaced: 0, skipped: 1 });
    expect(await importItems({ results: [{ name: 'Lute', equipment_category: { name: 'Tools' } }] }, open)).toMatchObject({ added: 1 });
    expect(await open.items.count()).toBe(3);
    await expect(importItems({}, open)).rejects.toThrow('No items found');
  });
});
