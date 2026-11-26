import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackerDB, campaignContents, deleteCampaign, deleteOrganization, localSyncData, saveNpc, saveOrganization, setOrganizationMembers } from '.';
import { blankOrganization } from '../logic';

let n = 0;
let open: TrackerDB | undefined;
afterEach(async () => {
  open?.close();
  await open?.delete();
  open = undefined;
});

const groups = async (db: TrackerDB) => Object.fromEntries((await db.npcs.toArray()).map((x) => [x.name, x.organizationIds]));

describe('organizations', () => {
  it('sets members: listed NPCs join, others leave, other campaigns are untouched', async () => {
    open = new TrackerDB(`orgs-${++n}`);
    await saveOrganization({ ...blankOrganization('c', 'Harpers'), id: 'h' }, open);
    await saveNpc({ id: 'g', campaignId: 'c', name: 'Garaele', organizationIds: ['h'] }, open);
    await saveNpc({ id: 'a', campaignId: 'c', name: 'Aubrey', organizationIds: ['z'] }, open);
    await saveNpc({ id: 'x', campaignId: 'other', name: 'Elsewhere', organizationIds: ['h'] }, open);

    await setOrganizationMembers('h', 'c', ['a'], open);
    expect(await groups(open)).toEqual({ Garaele: undefined, Aubrey: ['z', 'h'], Elsewhere: ['h'] });
    // Leaving the last organization drops the field.
    expect('organizationIds' in (await open.npcs.get('g'))!).toBe(false);
    expect((await open.npcs.where('organizationIds').equals('h').primaryKeys()).sort()).toEqual(['a', 'x']);
  });

  it('deleting an organization keeps its members and remembers the deletion', async () => {
    open = new TrackerDB(`orgs-${++n}`);
    await saveOrganization({ ...blankOrganization('c', 'Harpers'), id: 'h' }, open);
    await saveNpc({ id: 'g', campaignId: 'c', name: 'Garaele', organizationIds: ['h', 'z'] }, open);

    await deleteOrganization('h', open);
    expect(await groups(open)).toEqual({ Garaele: ['z'] });
    const data = await localSyncData(open);
    expect(data.organizations).toEqual([]);
    expect(data.deletions).toEqual([expect.objectContaining({ table: 'organizations', id: 'h' })]);
  });

  it('belong to their campaign and go with it', async () => {
    open = new TrackerDB(`orgs-${++n}`);
    await saveOrganization({ ...blankOrganization('c', 'Harpers'), id: 'h' }, open);
    expect((await campaignContents('c', open)).organizations.map((o) => o.name)).toEqual(['Harpers']);
    await deleteCampaign('c', open);
    expect(await open.organizations.count()).toBe(0);
  });
});
