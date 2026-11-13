import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TrackerDB,
  deleteCombat,
  deleteCreature,
  deletePlayer,
  importCreatures,
  onLocalChange,
  saveCombat,
  saveCreature,
  savePlayer,
} from '../db';
import { makeCombat, makeTemplate } from '../logic/testUtils';
import type { SyncFile } from '../models';
import { syncOnce, type SyncRemote } from './engine';

/** Stands in for the file in Google Drive; stores a JSON copy like a real upload would. */
class MemoryRemote implements SyncRemote {
  json: string | null = null;
  saves = 0;
  async load() {
    return this.json ? (JSON.parse(this.json) as SyncFile) : null;
  }
  async save(f: SyncFile) {
    this.saves++;
    this.json = JSON.stringify(f);
  }
}

let n = 0;
const opened: TrackerDB[] = [];
const device = () => {
  const d = new TrackerDB(`sync-${++n}`);
  opened.push(d);
  return d;
};
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete();
});
const tick = () => new Promise((r) => setTimeout(r, 2)); // distinct updatedAt stamps

describe('syncOnce between two devices', () => {
  it('the first sync uploads; a second device gets everything', async () => {
    const remote = new MemoryRemote();
    const laptop = device();
    await saveCreature(makeTemplate({ id: 'gob', name: 'Goblin' }), laptop);
    await savePlayer({ id: 'p1', name: 'Aria', initiativeBonus: 2 }, laptop);
    await saveCombat(makeCombat([], { id: 'c1', status: 'staged' }), laptop);
    expect(await syncOnce(remote, laptop)).toEqual({ pulled: false, pushed: true });

    const tablet = device();
    expect(await syncOnce(remote, tablet)).toEqual({ pulled: true, pushed: false });
    expect((await tablet.creatures.get('gob'))?.name).toBe('Goblin');
    expect((await tablet.players.get('p1'))?.name).toBe('Aria');
    expect(await tablet.combats.count()).toBe(1);
  });

  it('nothing to do when both sides match', async () => {
    const remote = new MemoryRemote();
    const laptop = device();
    await saveCreature(makeTemplate({ id: 'gob' }), laptop);
    await syncOnce(remote, laptop);
    expect(await syncOnce(remote, laptop)).toEqual({ pulled: false, pushed: false });
    expect(remote.saves).toBe(1);
  });

  it('edits on both devices merge; the newer edit of the same item wins', async () => {
    const remote = new MemoryRemote();
    const laptop = device();
    const tablet = device();
    await saveCreature(makeTemplate({ id: 'gob', name: 'Goblin' }), laptop);
    await syncOnce(remote, laptop);
    await syncOnce(remote, tablet);

    await saveCreature(makeTemplate({ id: 'gob', name: 'Goblin (laptop)' }), laptop);
    await tick();
    await saveCreature(makeTemplate({ id: 'gob', name: 'Goblin boss (tablet)' }), tablet);
    await savePlayer({ id: 'p2', name: 'Brom', initiativeBonus: 0 }, tablet);
    await syncOnce(remote, laptop);
    await syncOnce(remote, tablet);
    await syncOnce(remote, laptop);

    for (const d of [laptop, tablet]) {
      expect((await d.creatures.get('gob'))?.name).toBe('Goblin boss (tablet)');
      expect((await d.players.get('p2'))?.name).toBe('Brom');
    }
  });

  it('deleting on one device deletes everywhere', async () => {
    const remote = new MemoryRemote();
    const laptop = device();
    const tablet = device();
    await saveCreature(makeTemplate({ id: 'gob' }), laptop);
    await savePlayer({ id: 'p1', name: 'Aria', initiativeBonus: 0 }, laptop);
    await saveCombat(makeCombat([], { id: 'c1', status: 'ended' }), laptop);
    await syncOnce(remote, laptop);
    await syncOnce(remote, tablet);

    await tick();
    await deleteCreature('gob', tablet);
    await deletePlayer('p1', tablet);
    await deleteCombat('c1', tablet);
    await syncOnce(remote, tablet);
    await syncOnce(remote, laptop);
    expect(await laptop.creatures.count()).toBe(0);
    expect(await laptop.players.count()).toBe(0);
    expect(await laptop.combats.count()).toBe(0);
    expect(await laptop.deletions.count()).toBe(3);
  });

  it('re-importing a deleted stat block brings it back everywhere', async () => {
    const remote = new MemoryRemote();
    const laptop = device();
    await saveCreature(makeTemplate({ id: 'gob', name: 'Goblin' }), laptop);
    await deleteCreature('gob', laptop);
    await syncOnce(remote, laptop);
    await tick();
    await importCreatures([{ id: 'gob', name: 'Goblin' }], laptop);
    await syncOnce(remote, laptop);

    const tablet = device();
    await syncOnce(remote, tablet);
    expect((await tablet.creatures.get('gob'))?.name).toBe('Goblin');
  });

  it('local saves notify listeners; sync writes do not', async () => {
    const remote = new MemoryRemote();
    const laptop = device();
    let count = 0;
    const off = onLocalChange(() => count++);
    await saveCreature(makeTemplate({ id: 'gob' }), laptop);
    await deleteCreature('gob', laptop);
    expect(count).toBe(2);
    await syncOnce(remote, laptop);
    const tablet = device();
    await syncOnce(remote, tablet);
    expect(count).toBe(2);
    off();
  });
});

describe('database version 3', () => {
  it('opens a version 2 database and keeps its data', async () => {
    const name = `sync-upgrade-${++n}`;
    const Dexie = (await import('dexie')).default;
    const old = new Dexie(name);
    old.version(2).stores({
      creatures: 'id, name, type, cr, updatedAt',
      players: 'id, name',
      encounters: 'id, name, *tags, updatedAt',
      combats: 'id, encounterId, status, updatedAt',
    });
    await old.table('players').put({ id: 'p1', name: 'Aria', initiativeBonus: 1 });
    old.close();

    const upgraded = new TrackerDB(name);
    opened.push(upgraded);
    expect((await upgraded.players.get('p1'))?.name).toBe('Aria');
    expect(await upgraded.deletions.count()).toBe(0);
  });
});
