import Dexie, { type EntityTable } from 'dexie';
import { campaignOf, defaultCampaign, inCampaign, newCampaign } from '../logic/campaign';
import { normalizeConditions } from '../logic/conditions';
import { normalizeCreature } from '../logic/creature';
import { normalizeSpell } from '../logic/spells';
import { mergeSyncData, sameSyncData, stampOf, tombstoneKey } from '../logic/sync';
import {
  DEFAULT_CAMPAIGN_ID,
  SYNC_TABLES,
  type Campaign,
  type Combat,
  type CreatureTemplate,
  type Encounter,
  type ID,
  type Player,
  type Spell,
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
  campaigns!: EntityTable<Campaign, 'id'>;
  creatures!: EntityTable<CreatureTemplate, 'id'>;
  spells!: EntityTable<Spell, 'id'>;
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
    // v4: campaigns. Existing players, encounters and combats move into a default campaign. Their
    // `updatedAt` is left alone: other devices treat a missing campaignId as that same campaign.
    this.version(4)
      .stores({ campaigns: 'id, name' })
      .upgrade(async (tx) => {
        const counts = await Promise.all(['players', 'encounters', 'combats'].map((t) => tx.table(t).count()));
        if (counts.every((n) => n === 0)) return;
        await tx.table('campaigns').put(defaultCampaign());
        const encounterCampaign = new Map<ID, ID>();
        await tx.table('players').toCollection().modify((p: Player) => void (p.campaignId ??= DEFAULT_CAMPAIGN_ID));
        await tx
          .table('encounters')
          .toCollection()
          .modify((e: Encounter) => {
            e.campaignId ??= DEFAULT_CAMPAIGN_ID;
            encounterCampaign.set(e.id, e.campaignId);
          });
        await tx
          .table('combats')
          .toCollection()
          .modify((c: Combat) => void (c.campaignId ??= encounterCampaign.get(c.encounterId) ?? DEFAULT_CAMPAIGN_ID));
      });
    // v5: the spell list, which stat blocks link to by id.
    this.version(5).stores({ spells: 'id, name, level, updatedAt' });
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

// ---------- campaigns ----------

export async function saveCampaign(c: Campaign, database: TrackerDB = db): Promise<void> {
  await database.campaigns.put({ ...c, updatedAt: Date.now() });
  changed();
}

/**
 * Makes sure there's at least one campaign to work in. A fresh install gets the default placeholder
 * (which loses to anything synced in); if that was deleted on purpose, a brand-new one instead.
 */
export async function ensureCampaign(database: TrackerDB = db): Promise<void> {
  if ((await database.campaigns.count()) > 0) return;
  const defaultDeleted = await database.deletions.get(tombstoneKey({ table: 'campaigns', id: DEFAULT_CAMPAIGN_ID }));
  if (defaultDeleted) await saveCampaign(newCampaign('My Campaign'), database);
  else await database.campaigns.put(defaultCampaign());
}

export interface CampaignContents {
  players: Player[];
  encounters: Encounter[];
  combats: Combat[];
}

export async function campaignContents(id: ID, database: TrackerDB = db): Promise<CampaignContents> {
  const [players, encounters, combats] = await Promise.all([
    database.players.filter(inCampaign(id)).toArray(),
    database.encounters.filter(inCampaign(id)).toArray(),
    database.combats.filter(inCampaign(id)).toArray(),
  ]);
  return { players, encounters, combats };
}

/** Deletes a campaign with its players, encounters and combats. Stat blocks are shared and stay. */
export async function deleteCampaign(id: ID, database: TrackerDB = db): Promise<void> {
  const tables = [database.campaigns, database.players, database.encounters, database.combats, database.deletions];
  await database.transaction('rw', tables, async () => {
    const contents = await campaignContents(id, database);
    const deletedAt = Date.now();
    const doomed: Tombstone[] = [
      { table: 'campaigns', id, deletedAt },
      ...contents.players.map((r) => ({ table: 'players' as const, id: r.id, deletedAt })),
      ...contents.encounters.map((r) => ({ table: 'encounters' as const, id: r.id, deletedAt })),
      ...contents.combats.map((r) => ({ table: 'combats' as const, id: r.id, deletedAt })),
    ];
    for (const t of doomed) await database.table(t.table).delete(t.id);
    await database.deletions.bulkPut(doomed.map((t) => ({ ...t, key: tombstoneKey(t) })));
  });
  changed();
}

/** Moves the combats staged from an encounter into the given campaign (after the encounter itself moved). */
export async function moveEncounterCombats(encounterId: ID, campaignId: ID, database: TrackerDB = db): Promise<void> {
  const combats = (await database.combats.where('encounterId').equals(encounterId).toArray()).filter(
    (c) => campaignOf(c) !== campaignId,
  );
  if (combats.length === 0) return;
  const now = Date.now();
  await database.combats.bulkPut(combats.map((c) => ({ ...c, campaignId, updatedAt: now })));
  changed();
}

// ---------- creatures ----------

export async function saveCreature(t: CreatureTemplate, database: TrackerDB = db): Promise<void> {
  await database.creatures.put({ ...t, updatedAt: Date.now() });
  changed();
}

export async function deleteCreature(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'creatures', id);
}

// ---------- spells ----------

export async function saveSpell(s: Spell, database: TrackerDB = db): Promise<void> {
  await database.spells.put({ ...s, updatedAt: Date.now() });
  changed();
}

/** Deletes a spell. Stat blocks that link to it just stop showing it. */
export async function deleteSpell(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'spells', id);
}

/** Stat blocks that link to a spell, so deleting it can warn first. */
export async function creaturesUsingSpell(id: ID, database: TrackerDB = db): Promise<CreatureTemplate[]> {
  return database.creatures.filter((c) => !!c.spellIds?.includes(id)).toArray();
}

export async function exportSpells(ids?: readonly ID[], database: TrackerDB = db): Promise<BackupFile> {
  const spells = ids
    ? (await database.spells.bulkGet([...ids])).filter((s): s is Spell => !!s)
    : await database.spells.toArray();
  return { app: 'dm-combat-tracker', version: 1, exportedAt: new Date().toISOString(), creatures: [], spells };
}

/** Puts imported spells, counting which were new. Spells count as edited now, so sync treats them as newest. */
async function putImportedSpells(spells: Spell[], database: TrackerDB): Promise<{ added: number; replaced: number }> {
  if (spells.length === 0) return { added: 0, replaced: 0 };
  const now = Date.now();
  const existing = (await database.spells.bulkGet(spells.map((s) => s.id))).filter(Boolean).length;
  await database.spells.bulkPut(spells.map((s) => ({ ...s, updatedAt: now })));
  return { added: spells.length - existing, replaced: existing };
}

/**
 * Imports spells from a backup file (its `spells`), a bare array, an object with a `results` list
 * (as public 5e APIs return), or a single spell. Entries without a name are skipped.
 */
export async function importSpells(data: unknown, database: TrackerDB = db): Promise<ImportResult> {
  const o = data as { spells?: unknown; results?: unknown } | null;
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(o?.spells)
      ? o.spells
      : Array.isArray(o?.results)
        ? o.results
        : data && typeof data === 'object' && 'name' in data
          ? [data]
          : [];
  if (list.length === 0) throw new Error('No spells found in file.');
  const valid = list.map(normalizeSpell).filter((s): s is Spell => s !== null);
  if (valid.length === 0) throw new Error('No spells with a name found in file.');
  const r = await putImportedSpells(valid, database);
  changed();
  return { ...r, skipped: list.length - valid.length };
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
  /** The spells the exported stat blocks link to (or the exported spell list). */
  spells?: Spell[];
  players?: Player[];
  encounters?: Encounter[];
}

/** Exports every stat block, or only the given ids. */
export async function exportCreatures(ids?: readonly ID[], database: TrackerDB = db): Promise<BackupFile> {
  const creatures = ids
    ? (await database.creatures.bulkGet([...ids])).filter((c): c is CreatureTemplate => !!c)
    : await database.creatures.toArray();
  const spellIds = [...new Set(creatures.flatMap((c) => c.spellIds ?? []))];
  const spells = (await database.spells.bulkGet(spellIds)).filter((s): s is Spell => !!s);
  return {
    app: 'dm-combat-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    creatures,
    ...(spells.length ? { spells } : {}),
  };
}

export interface ImportResult {
  added: number;
  replaced: number;
  skipped: number;
  /** Spells that came along with imported stat blocks. */
  spells?: number;
}

/**
 * Imports stat blocks from a backup file, a bare array, or a single stat block object. Partial
 * entries are filled with defaults; entries without a name are skipped. Existing stat blocks with
 * the same id are replaced. Spells in a backup file come along too.
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
  const spells = (Array.isArray(backup?.spells) ? backup.spells : [])
    .map(normalizeSpell)
    .filter((s): s is Spell => s !== null);
  await database.transaction('rw', database.creatures, database.spells, async () => {
    await database.creatures.bulkPut(valid);
    await putImportedSpells(spells, database);
  });
  changed();
  return {
    added: valid.length - existing.size,
    replaced: existing.size,
    skipped: list.length - valid.length,
    ...(spells.length ? { spells: spells.length } : {}),
  };
}

/** Encounters that use a stat block, so deleting it can warn first. */
export async function encountersUsingCreature(id: ID, database: TrackerDB = db): Promise<Encounter[]> {
  return database.encounters.filter((e) => e.entries.some((x) => x.templateId === id)).toArray();
}

// ---------- sync ----------

/** Everything sync covers, as stored on this device. */
export async function localSyncData(database: TrackerDB = db): Promise<SyncData> {
  const [campaigns, creatures, spells, players, encounters, combats, deletions] = await Promise.all([
    database.campaigns.toArray(),
    database.creatures.toArray(),
    database.spells.toArray(),
    database.players.toArray(),
    database.encounters.toArray(),
    database.combats.toArray(),
    database.deletions.toArray(),
  ]);
  return { campaigns, creatures, spells, players, encounters, combats, deletions: deletions.map(({ key: _key, ...t }) => t) };
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
