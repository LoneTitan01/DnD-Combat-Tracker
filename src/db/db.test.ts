import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TrackerDB,
  combatsByStatus,
  creaturesUsingSpell,
  exportCreatures,
  exportSpells,
  importCreatures,
  importSpells,
  localSyncData,
  mergeIntoLocal,
  removeBundledSpells,
  saveCombat,
  saveCreature,
  savePlayer,
  saveSpell,
} from '.';
import { blankSpell } from '../logic/spells';
import type { Spell } from '../models';
import { makeCombat, makeCombatant, makeTemplate } from '../logic/testUtils';

let n = 0;
const fresh = () => new TrackerDB(`test-${++n}`);
let open: TrackerDB | undefined;
afterEach(async () => {
  await open?.delete();
});

describe('TrackerDB', () => {
  it('persists across a reopen (simulated refresh)', async () => {
    open = fresh();
    await saveCreature(makeTemplate({ id: 'gob', name: 'Goblin' }), open);
    await savePlayer({ id: 'p1', name: 'Aria', initiativeBonus: 2 }, open);
    open.close();

    const reopened = new TrackerDB(open.name);
    await reopened.open();
    expect((await reopened.creatures.get('gob'))?.name).toBe('Goblin');
    expect(await reopened.players.count()).toBe(1);
    open = reopened;
  });

  it('saves and resumes combats with full state', async () => {
    open = fresh();
    const combat = makeCombat([makeCombatant({ tokenName: 'Red cap', currentHP: 3 })], { status: 'staged' });
    await saveCombat(combat, open);
    const [loaded] = await combatsByStatus('staged', open);
    expect(loaded?.combatants[0]).toMatchObject({ tokenName: 'Red cap', currentHP: 3 });
  });

  it('round-trips stat blocks through JSON export/import', async () => {
    open = fresh();
    await saveCreature(makeTemplate({ id: 'a', name: 'Owlbear' }), open);
    const json = JSON.parse(JSON.stringify(await exportCreatures(undefined, open)));
    const other = fresh();
    expect(await importCreatures(json, other)).toEqual({ added: 1, replaced: 0, skipped: 0 });
    expect(await importCreatures(json, other)).toEqual({ added: 0, replaced: 1, skipped: 0 });
    expect((await other.creatures.get('a'))?.name).toBe('Owlbear');
    await other.delete();
  });

  it('imports a single stat block and skips nameless entries', async () => {
    open = fresh();
    expect(await importCreatures({ name: 'Bandit', cr: '1/8' }, open)).toMatchObject({ added: 1 });
    expect(await importCreatures([{ name: 'Thug' }, { cr: '1' }], open)).toEqual({ added: 1, replaced: 0, skipped: 1 });
    expect(await open.creatures.count()).toBe(2);
  });

  it('exports only the selected stat blocks', async () => {
    open = fresh();
    await saveCreature(makeTemplate({ id: 'a' }), open);
    await saveCreature(makeTemplate({ id: 'b' }), open);
    expect((await exportCreatures(['b'], open)).creatures.map((c) => c.id)).toEqual(['b']);
  });

  it('exports a stat block with its linked spells, and imports both', async () => {
    open = fresh();
    await saveSpell({ ...blankSpell(), id: 'fb', name: 'Fireball' }, open);
    await saveSpell({ ...blankSpell(), id: 'other', name: 'Shield' }, open);
    await saveCreature(makeTemplate({ id: 'mage', name: 'Mage', spellIds: ['fb', 'gone'] }), open);
    const json = JSON.parse(JSON.stringify(await exportCreatures(['mage'], open)));
    expect(json.spells.map((s: { id: string }) => s.id)).toEqual(['fb']);

    const other = fresh();
    const r = await importCreatures(json, other);
    expect(r).toMatchObject({ added: 1, spells: 1 });
    expect((await other.spells.get('fb'))?.name).toBe('Fireball');
    expect((await other.creatures.get('mage'))?.spellIds).toEqual(['fb', 'gone']);
    expect((await creaturesUsingSpell('fb', other)).map((c) => c.id)).toEqual(['mage']);
    await other.delete();
  });

  it('round-trips the spell list and imports API-style result lists', async () => {
    open = fresh();
    await saveSpell({ ...blankSpell(), id: 'fb', name: 'Fireball' }, open);
    const json = JSON.parse(JSON.stringify(await exportSpells(undefined, open)));
    const other = fresh();
    expect(await importSpells(json, other)).toEqual({ added: 1, replaced: 0, skipped: 0 });
    expect(await importSpells({ results: [{ name: 'Fireball', id: 'fb' }, { name: 'Light' }, {}] }, other)).toEqual({
      added: 1,
      replaced: 1,
      skipped: 1,
    });
    await expect(importSpells({ nope: 1 }, other)).rejects.toThrow('No spells');
    await other.delete();
  });

  it('removes the spells old versions added by default, keeping edited and own spells', async () => {
    open = fresh();
    const bundled = (id: string): Spell => ({ ...blankSpell(), id: `srd-2024_${id}`, name: id, createdAt: 0, updatedAt: 0 });
    await open.spells.bulkAdd([bundled('a'), bundled('b'), bundled('c')]);
    await saveSpell({ ...bundled('b'), range: 'edited' }, open);
    await saveSpell({ ...blankSpell(), id: 'mine', name: 'Mine' }, open);

    expect(await removeBundledSpells(open)).toBe(2);
    expect(await removeBundledSpells(open)).toBe(0);
    expect((await open.spells.toArray()).map((s) => s.id).sort()).toEqual(['mine', 'srd-2024_b']);

    // The deletions sync, so an old-version device that still has them drops them instead of syncing them back.
    const other = fresh();
    await other.spells.bulkAdd([bundled('a'), bundled('c')]);
    await mergeIntoLocal(await localSyncData(open), other);
    expect(await other.spells.get('srd-2024_a')).toBeUndefined();
    expect(await other.spells.get('srd-2024_c')).toBeUndefined();
    await other.delete();
  });

  it('upgrades plain-name conditions in combats saved by v1', async () => {
    const name = `test-upgrade-${++n}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({
      creatures: 'id, name, type, cr, updatedAt',
      players: 'id, name',
      encounters: 'id, name, *tags, updatedAt',
      combats: 'id, encounterId, status, updatedAt',
    });
    const old = makeCombat([makeCombatant({ id: 'g' })]);
    (old.combatants[0] as unknown as { conditions: string[] }).conditions = ['prone', 'poisoned'];
    await v1.table('combats').put(old);
    v1.close();

    open = new TrackerDB(name);
    const upgraded = await open.combats.get(old.id);
    expect(upgraded?.combatants[0]!.conditions).toEqual([{ name: 'prone' }, { name: 'poisoned' }]);
  });

  it('rejects files without creatures', async () => {
    open = fresh();
    await expect(importCreatures({ foo: 1 }, open)).rejects.toThrow();
  });
});
