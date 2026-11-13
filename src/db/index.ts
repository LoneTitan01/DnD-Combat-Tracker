import Dexie, { type EntityTable } from 'dexie';
import { normalizeConditions } from '../logic/conditions';
import { normalizeCreature } from '../logic/creature';
import type { Combat, CreatureTemplate, Encounter, ID, Player } from '../models';

/**
 * IndexedDB via Dexie. Everything else talks to this module, so it can later be swapped
 * for a backend (Supabase/Firebase) behind the same functions.
 */
export class TrackerDB extends Dexie {
  creatures!: EntityTable<CreatureTemplate, 'id'>;
  players!: EntityTable<Player, 'id'>;
  encounters!: EntityTable<Encounter, 'id'>;
  combats!: EntityTable<Combat, 'id'>;

  constructor(name = 'dm-combat-tracker') {
    super(name);
    // Only indexed fields are listed; the full objects are stored regardless.
    this.version(1).stores({
      creatures: 'id, name, type, cr, updatedAt',
      players: 'id, name',
      encounters: 'id, name, *tags, updatedAt',
      combats: 'id, encounterId, status, updatedAt',
    });
    // v2: conditions changed from plain names to { name, rounds?, ends?, anchorId? } for durations.
    this.version(2).upgrade((tx) =>
      tx
        .table('combats')
        .toCollection()
        .modify((combat: Combat) => {
          for (const c of combat.combatants) c.conditions = normalizeConditions(c.conditions);
        }),
    );
  }
}

export const db = new TrackerDB();

/** Ask the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// ---------- creatures ----------

export async function saveCreature(t: CreatureTemplate, database: TrackerDB = db): Promise<void> {
  await database.creatures.put({ ...t, updatedAt: Date.now() });
}

export async function deleteCreature(id: ID, database: TrackerDB = db): Promise<void> {
  await database.creatures.delete(id);
}

// ---------- players ----------

export async function savePlayer(p: Player, database: TrackerDB = db): Promise<void> {
  await database.players.put(p);
}

export async function deletePlayer(id: ID, database: TrackerDB = db): Promise<void> {
  await database.players.delete(id);
}

// ---------- encounters ----------

export async function saveEncounter(e: Encounter, database: TrackerDB = db): Promise<void> {
  await database.encounters.put({ ...e, updatedAt: Date.now() });
}

export async function deleteEncounter(id: ID, database: TrackerDB = db): Promise<void> {
  await database.encounters.delete(id);
}

// ---------- combats ----------

/** Autosave target for the running combat; called after every change. */
export async function saveCombat(c: Combat, database: TrackerDB = db): Promise<void> {
  await database.combats.put({ ...c, updatedAt: Date.now() });
}

export async function deleteCombat(id: ID, database: TrackerDB = db): Promise<void> {
  await database.combats.delete(id);
}

export async function combatsByStatus(status: Combat['status'], database: TrackerDB = db): Promise<Combat[]> {
  return database.combats.where('status').equals(status).reverse().sortBy('updatedAt');
}

// ---------- backup ----------

export interface BackupFile {
  app: 'dm-combat-tracker';
  version: 1;
  exportedAt: string;
  creatures: CreatureTemplate[];
  players?: Player[];
  encounters?: Encounter[];
}

/** Exports every stat block, or only the given ids. */
export async function exportCreatures(ids?: readonly ID[], database: TrackerDB = db): Promise<BackupFile> {
  const creatures = ids
    ? (await database.creatures.bulkGet([...ids])).filter((c): c is CreatureTemplate => !!c)
    : await database.creatures.toArray();
  return { app: 'dm-combat-tracker', version: 1, exportedAt: new Date().toISOString(), creatures };
}

export interface ImportResult {
  added: number;
  replaced: number;
  skipped: number;
}

/**
 * Imports stat blocks from a backup file, a bare array, or a single stat block object. Partial
 * entries are filled with defaults; entries without a name are skipped. Existing stat blocks with
 * the same id are replaced.
 */
export async function importCreatures(data: unknown, database: TrackerDB = db): Promise<ImportResult> {
  const backup = data as Partial<BackupFile> | null;
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(backup?.creatures)
      ? backup.creatures
      : data && typeof data === 'object' && 'name' in data
        ? [data]
        : [];
  if (list.length === 0) throw new Error('No creatures found in file.');
  const valid = list.map(normalizeCreature).filter((c): c is CreatureTemplate => c !== null);
  if (valid.length === 0) throw new Error('No creatures with a name found in file.');
  const existing = new Set(
    (await database.creatures.bulkGet(valid.map((c) => c.id))).filter(Boolean).map((c) => c!.id),
  );
  await database.creatures.bulkPut(valid);
  return {
    added: valid.length - existing.size,
    replaced: existing.size,
    skipped: list.length - valid.length,
  };
}

/** Encounters that use a stat block, so deleting it can warn first. */
export async function encountersUsingCreature(id: ID, database: TrackerDB = db): Promise<Encounter[]> {
  return database.encounters.filter((e) => e.entries.some((x) => x.templateId === id)).toArray();
}
