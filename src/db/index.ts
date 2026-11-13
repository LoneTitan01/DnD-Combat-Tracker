import Dexie, { type EntityTable } from 'dexie';
import { normalizeConditions } from '../logic/conditions';
import { normalizeCreature } from '../logic/creature';
import { mergeSyncData, sameSyncData, stampOf, tombstoneKey } from '../logic/sync';
import {
  SYNC_TABLES,
  type Combat,
  type CreatureTemplate,
  type Encounter,
  type ID,
  type Player,
  type SyncData,
  type SyncTable,
  type Tombstone,
} from '../models';

export type StoredTombstone = Tombstone & { key: string };

/**
 * IndexedDB via Dexie. Everything else talks to this module, so it can later be swapped
 * for a backend (Supabase/Firebase) behind the same functions.
 */
export class TrackerDB extends Dexie {
  creatures!: EntityTable<CreatureTemplate, 'id'>;
  players!: EntityTable<Player, 'id'>;
  encounters!: EntityTable<Encounter, 'id'>;
  combats!: EntityTable<Combat, 'id'>;
  deletions!: EntityTable<StoredTombstone, 'key'>;

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
    // v3: deletions are remembered (tombstones) so sync can delete on other devices too.
    this.version(3).stores({ deletions: 'key, table, deletedAt' });
  }
}

export const db = new TrackerDB();

// ---------- change notifications ----------

const listeners = new Set<() => void>();

/** Called after every local save or delete (not after sync writes), so sync can upload soon. */
export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  for (const fn of listeners) fn();
}

/** Deletes a record and remembers the deletion for sync. */
async function deleteWithTombstone(database: TrackerDB, table: SyncTable, id: ID): Promise<void> {
  await database.transaction('rw', database.table(table), database.deletions, async () => {
    await database.table(table).delete(id);
    const t: Tombstone = { table, id, deletedAt: Date.now() };
    await database.deletions.put({ ...t, key: tombstoneKey(t) });
  });
  changed();
}

/** Ask the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// ---------- creatures ----------

export async function saveCreature(t: CreatureTemplate, database: TrackerDB = db): Promise<void> {
  await database.creatures.put({ ...t, updatedAt: Date.now() });
  changed();
}

export async function deleteCreature(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'creatures', id);
}

// ---------- players ----------

export async function savePlayer(p: Player, database: TrackerDB = db): Promise<void> {
  await database.players.put({ ...p, updatedAt: Date.now() });
  changed();
}

export async function deletePlayer(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'players', id);
}

// ---------- encounters ----------

export async function saveEncounter(e: Encounter, database: TrackerDB = db): Promise<void> {
  await database.encounters.put({ ...e, updatedAt: Date.now() });
  changed();
}

export async function deleteEncounter(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'encounters', id);
}

// ---------- combats ----------

/** Autosave target for the running combat; called after every change. */
export async function saveCombat(c: Combat, database: TrackerDB = db): Promise<void> {
  await database.combats.put({ ...c, updatedAt: Date.now() });
  changed();
}

export async function deleteCombat(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'combats', id);
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
  // Imported stat blocks count as edited now, so sync treats them as the newest copy.
  const now = Date.now();
  const valid = list
    .map(normalizeCreature)
    .filter((c): c is CreatureTemplate => c !== null)
    .map((c) => ({ ...c, updatedAt: now }));
  if (valid.length === 0) throw new Error('No creatures with a name found in file.');
  const existing = new Set(
    (await database.creatures.bulkGet(valid.map((c) => c.id))).filter(Boolean).map((c) => c!.id),
  );
  await database.creatures.bulkPut(valid);
  changed();
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

// ---------- sync ----------

/** Everything sync covers, as stored on this device. */
export async function localSyncData(database: TrackerDB = db): Promise<SyncData> {
  const [creatures, players, encounters, combats, deletions] = await Promise.all([
    database.creatures.toArray(),
    database.players.toArray(),
    database.encounters.toArray(),
    database.combats.toArray(),
    database.deletions.toArray(),
  ]);
  return { creatures, players, encounters, combats, deletions: deletions.map(({ key: _key, ...t }) => t) };
}

export interface MergeResult {
  merged: SyncData;
  /** Whether this device's data changed. */
  localChanged: boolean;
  /** Whether the merged data differs from what the other side sent. */
  remoteChanged: boolean;
}

/**
 * Merges another copy (from Google Drive) into this device's data in one transaction, writing only
 * the records that changed. Doesn't fire `onLocalChange`, so a sync doesn't trigger another upload.
 */
export async function mergeIntoLocal(remote: SyncData, database: TrackerDB = db): Promise<MergeResult> {
  const tables = [...SYNC_TABLES.map((t) => database.table(t)), database.deletions];
  return database.transaction('rw', tables, async () => {
    const local = await localSyncData(database);
    const merged = mergeSyncData(local, remote);
    let localChanged = false;
    for (const t of SYNC_TABLES) {
      const before = new Map((local[t] as Array<{ id: ID; updatedAt?: number }>).map((r) => [r.id, stampOf(r)]));
      const after = merged[t] as Array<{ id: ID; updatedAt?: number }>;
      const puts = after.filter((r) => before.get(r.id) !== stampOf(r));
      const keep = new Set(after.map((r) => r.id));
      const deletes = [...before.keys()].filter((id) => !keep.has(id));
      if (puts.length) await database.table(t).bulkPut(puts);
      if (deletes.length) await database.table(t).bulkDelete(deletes);
      localChanged ||= puts.length > 0 || deletes.length > 0;
    }
    const known = new Map(local.deletions.map((d) => [tombstoneKey(d), d.deletedAt]));
    const newTombstones = merged.deletions.filter((d) => known.get(tombstoneKey(d)) !== d.deletedAt);
    if (newTombstones.length) {
      await database.deletions.bulkPut(newTombstones.map((d) => ({ ...d, key: tombstoneKey(d) })));
      localChanged = true;
    }
    return { merged, localChanged, remoteChanged: !sameSyncData(merged, remote) };
  });
}
