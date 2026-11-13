import { SYNC_TABLES, type ID, type SyncData, type SyncFile, type SyncTable, type Tombstone } from '../models';

/*
 * Sync merges two copies of the whole database (this device and the file in Google Drive):
 *  - Per record, the copy with the newer `updatedAt` wins (a tie keeps this device's copy).
 *  - A deletion (tombstone) beats every copy saved before it, and loses to a copy saved after it,
 *    so deleting on one device deletes everywhere, and re-saving afterwards brings it back.
 *  - Tombstones are kept, merged by the latest `deletedAt`.
 */

type Rec = { id: ID; updatedAt?: number };

export const stampOf = (r: Rec): number => r.updatedAt ?? 0;
export const tombstoneKey = (t: Pick<Tombstone, 'table' | 'id'>): string => `${t.table}:${t.id}`;

export function emptySyncData(): SyncData {
  return { creatures: [], players: [], encounters: [], combats: [], deletions: [] };
}

export function mergeTombstones(a: readonly Tombstone[], b: readonly Tombstone[]): Tombstone[] {
  const map = new Map<string, Tombstone>();
  for (const t of [...a, ...b]) {
    const prev = map.get(tombstoneKey(t));
    if (!prev || t.deletedAt > prev.deletedAt) map.set(tombstoneKey(t), t);
  }
  return [...map.values()];
}

function mergeTable<T extends Rec>(table: SyncTable, local: readonly T[], remote: readonly T[], deleted: Map<string, Tombstone>): T[] {
  const map = new Map<ID, T>();
  for (const r of local) map.set(r.id, r);
  for (const r of remote) {
    const mine = map.get(r.id);
    if (!mine || stampOf(r) > stampOf(mine)) map.set(r.id, r);
  }
  return [...map.values()].filter((r) => {
    const t = deleted.get(tombstoneKey({ table, id: r.id }));
    return !t || stampOf(r) > t.deletedAt;
  });
}

export function mergeSyncData(local: SyncData, remote: SyncData): SyncData {
  const deletions = mergeTombstones(local.deletions, remote.deletions);
  const deleted = new Map(deletions.map((t) => [tombstoneKey(t), t]));
  return {
    creatures: mergeTable('creatures', local.creatures, remote.creatures, deleted),
    players: mergeTable('players', local.players, remote.players, deleted),
    encounters: mergeTable('encounters', local.encounters, remote.encounters, deleted),
    combats: mergeTable('combats', local.combats, remote.combats, deleted),
    deletions,
  };
}

/** Same records at the same versions and the same deletions (contents are compared by version). */
export function sameSyncData(a: SyncData, b: SyncData): boolean {
  const sig = (list: readonly Rec[]) => list.map((r) => `${r.id}@${stampOf(r)}`).sort().join('|');
  const tsig = (list: readonly Tombstone[]) => list.map((t) => `${tombstoneKey(t)}@${t.deletedAt}`).sort().join('|');
  return SYNC_TABLES.every((t) => sig(a[t]) === sig(b[t])) && tsig(a.deletions) === tsig(b.deletions);
}

/** Checks a file downloaded from Drive. Throws a readable error for anything this version can't use. */
export function parseSyncFile(raw: unknown): SyncFile {
  const f = raw as Partial<SyncFile> | null;
  if (!f || typeof f !== 'object' || f.app !== 'dm-combat-tracker') throw new Error('The file in Google Drive isn’t a DM Combat Tracker sync file.');
  if (typeof f.format !== 'number' || f.format > 1) {
    throw new Error('The data in Google Drive was saved by a newer version of the app. Reload this page to update it.');
  }
  const list = <T,>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : []);
  return {
    app: 'dm-combat-tracker',
    format: 1,
    savedAt: typeof f.savedAt === 'number' ? f.savedAt : 0,
    creatures: list(f.creatures),
    players: list(f.players),
    encounters: list(f.encounters),
    combats: list(f.combats),
    deletions: list(f.deletions),
  };
}
