import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TrackerDB,
  combatsByStatus,
  creaturesUsingSpell,
  deleteSpell,
  exportCreatures,
  exportSpells,
  importCreatures,
  importSpells,
  localSyncData,
  mergeIntoLocal,
  restoreSrdSpells,
  saveCombat,
  saveCreature,
  savePlayer,
  saveSpell,
  seedSrdSpells,
  srdSpells,
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

  it('seeds the SRD spells once, keeping edits and deletions', async () => {
    open = fresh();
    const srd = await srdSpells();
    expect(srd.length).toBeGreaterThan(300);
    expect(new Set(srd.map((s) => s.id)).size).toBe(srd.length);
    expect(srd.every((s) => s.name && s.updatedAt === 0 && !/\*\*|\|/.test(s.description))).toBe(true);
    expect(srd.find((s) => s.id === 'srd-2024_fireball')).toMatchObject({ name: 'Fireball', level: 3, school: 'evocation' });

    expect(await seedSrdSpells(open)).toBe(srd.length);
    expect(await seedSrdSpells(open)).toBe(0);
    const fb = (await open.spells.get('srd-2024_fireball'))!;
    await saveSpell({ ...fb, range: '200 feet' }, open);
    await deleteSpell('srd-2024_shield', open);
    expect(await seedSrdSpells(open)).toBe(0);
    expect((await open.spells.get('srd-2024_fireball'))?.range).toBe('200 feet');
    expect(await open.spells.get('srd-2024_shield')).toBeUndefined();

    // Restoring brings deleted ones back, newer than the deletion, and leaves edits alone.
    expect(await restoreSrdSpells(open)).toBe(1);
    const shield = (await open.spells.get('srd-2024_shield'))!;
    expect(shield.updatedAt).toBeGreaterThan(0);
    expect((await open.spells.get('srd-2024_fireball'))?.range).toBe('200 feet');
  });

  it('lets synced edits and deletions win over seeded SRD spells', async () => {
    open = fresh();
    const srd = (await srdSpells()).slice(0, 3);
    const [a, b, c] = srd as [Spell, Spell, Spell];
    const other = fresh();
    await seedSrdSpells(open, srd);
    await seedSrdSpells(other, srd);
    await saveSpell({ ...a, range: 'edited' }, other);
    await deleteSpell(b.id, other);

    await mergeIntoLocal(await localSyncData(other), open);
    expect((await open.spells.get(a.id))?.range).toBe('edited');
    expect(await open.spells.get(b.id)).toBeUndefined();
    expect(await open.spells.get(c.id)).toBeDefined();
    // The synced deletion keeps the next start from seeding it again.
    expect(await seedSrdSpells(open, srd)).toBe(0);
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
