import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackerDB, deleteCampaign, ensureCampaign, moveEncounterCombats, saveCampaign, saveCombat, saveEncounter, saveLocation, savePlayer } from '.';
import { blankEncounter, blankLocation, campaignOf, newCampaign, stageCombat } from '../logic';
import { makeCombat } from '../logic/testUtils';
import { DEFAULT_CAMPAIGN_ID } from '../models';

let n = 0;
let open: TrackerDB | undefined;
afterEach(async () => {
  await open?.delete();
});

describe('campaigns', () => {
  it('moves pre-campaign data into the default campaign on upgrade', async () => {
    const name = `campaign-upgrade-${++n}`;
    const old = new Dexie(name);
    old.version(3).stores({
      creatures: 'id, name, type, cr, updatedAt',
      players: 'id, name',
      encounters: 'id, name, *tags, updatedAt',
      combats: 'id, encounterId, status, updatedAt',
      deletions: 'key, table, deletedAt',
    });
    await old.open();
    await old.table('players').put({ id: 'p1', name: 'Aria', initiativeBonus: 0, updatedAt: 5 });
    await old.table('encounters').put({ ...blankEncounter(), id: 'e1', updatedAt: 6 });
    await old.table('combats').put(makeCombat([], { id: 'c1', encounterId: 'e1' }));
    old.close();

    open = new TrackerDB(name);
    await open.open();
    expect((await open.campaigns.toArray()).map((c) => c.id)).toEqual([DEFAULT_CAMPAIGN_ID]);
    const p = await open.players.get('p1');
    expect(p?.campaignId).toBe(DEFAULT_CAMPAIGN_ID);
    expect(p?.updatedAt).toBe(5); // untouched, so sync doesn't see a change
    expect((await open.encounters.get('e1'))?.campaignId).toBe(DEFAULT_CAMPAIGN_ID);
    expect((await open.combats.get('c1'))?.campaignId).toBe(DEFAULT_CAMPAIGN_ID);
  });

  it('starts a fresh install with a placeholder campaign, or a new one if that was deleted', async () => {
    open = new TrackerDB(`campaign-ensure-${++n}`);
    await ensureCampaign(open);
    const [first] = await open.campaigns.toArray();
    expect(first).toMatchObject({ id: DEFAULT_CAMPAIGN_ID, updatedAt: 0 });
    await ensureCampaign(open);
    expect(await open.campaigns.count()).toBe(1);

    await deleteCampaign(DEFAULT_CAMPAIGN_ID, open);
    await ensureCampaign(open);
    const [second] = await open.campaigns.toArray();
    expect(second!.id).not.toBe(DEFAULT_CAMPAIGN_ID);
  });

  it('deleting a campaign deletes its players, locations, encounters and combats only', async () => {
    open = new TrackerDB(`campaign-delete-${++n}`);
    const a = newCampaign('A');
    const b = newCampaign('B');
    await saveCampaign(a, open);
    await saveCampaign(b, open);
    await savePlayer({ id: 'pa', campaignId: a.id, name: 'Aria', initiativeBonus: 0 }, open);
    await savePlayer({ id: 'pb', campaignId: b.id, name: 'Brom', initiativeBonus: 0 }, open);
    await saveLocation({ ...blankLocation(a.id), id: 'la', name: 'Leilon' }, [], open);
    await saveLocation({ ...blankLocation(b.id), id: 'lb', name: 'Phandalin' }, [], open);
    const ea = { ...blankEncounter(), id: 'ea', campaignId: a.id };
    await saveEncounter(ea, open);
    await saveCombat(stageCombat(ea, new Map()), open);

    await deleteCampaign(a.id, open);
    expect((await open.campaigns.toArray()).map((c) => c.name)).toEqual(['B']);
    expect((await open.players.toArray()).map((p) => p.id)).toEqual(['pb']);
    expect((await open.locations.toArray()).map((l) => l.id)).toEqual(['lb']);
    expect(await open.encounters.count()).toBe(0);
    expect(await open.combats.count()).toBe(0);
    expect((await open.deletions.toArray()).map((d) => d.table).sort()).toEqual(['campaigns', 'combats', 'encounters', 'locations', 'players']);
  });

  it('staged combats take their encounter campaign and follow it when moved', async () => {
    open = new TrackerDB(`campaign-move-${++n}`);
    const e = { ...blankEncounter(), campaignId: 'a' };
    const combat = stageCombat(e, new Map());
    expect(combat.campaignId).toBe('a');
    await saveCombat(combat, open);
    await moveEncounterCombats(e.id, 'b', open);
    expect(campaignOf((await open.combats.get(combat.id))!)).toBe('b');
  });
});
