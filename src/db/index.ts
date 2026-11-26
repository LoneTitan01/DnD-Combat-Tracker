import Dexie, { type EntityTable } from 'dexie';
import { campaignOf, defaultCampaign, inCampaign, newCampaign } from '../logic/campaign';
import { normalizeConditions } from '../logic/conditions';
import { normalizeCreature } from '../logic/creature';
import { needsRestock, planLocationDelete, planLocationSave, restockShop, sellOne } from '../logic/locations';
import { newId } from '../logic/ids';
import { npcsFromLegacyLocations } from '../logic/npcs';
import { normalizeItem } from '../logic/items';
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
  type Item,
  type Location,
  type Npc,
  type Organization,
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
  items!: EntityTable<Item, 'id'>;
  players!: EntityTable<Player, 'id'>;
  locations!: EntityTable<Location, 'id'>;
  npcs!: EntityTable<Npc, 'id'>;
  organizations!: EntityTable<Organization, 'id'>;
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
    // v6: locations, kept per campaign and nested through parentId.
    this.version(6).stores({ locations: 'id, campaignId, parentId, name' });
    // v7: NPCs get their own table, each linked to the location they live in. The names locations
    // listed become NPC records there. Locations keep their stamp: the old list is just dropped.
    this.version(7)
      .stores({ npcs: 'id, campaignId, locationId, name' })
      .upgrade(async (tx) => {
        const locations = await tx.table('locations').toArray();
        const npcs = npcsFromLegacyLocations(locations);
        if (npcs.length) await tx.table('npcs').bulkPut(npcs);
        await tx
          .table('locations')
          .toCollection()
          .modify((l: Location & { npcs?: unknown }) => void delete l.npcs);
      });
    // v8: organizations NPCs can belong to. Membership lives on the NPC, indexed for finding members.
    this.version(8).stores({ organizations: 'id, campaignId, name', npcs: 'id, campaignId, locationId, name, *organizationIds' });
    // v9: the item list (weapons, armor, tools and adventuring gear), shared by all campaigns.
    this.version(9).stores({ items: 'id, name, category, updatedAt' });
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
  locations: Location[];
  npcs: Npc[];
  organizations: Organization[];
  encounters: Encounter[];
  combats: Combat[];
}

export async function campaignContents(id: ID, database: TrackerDB = db): Promise<CampaignContents> {
  const [players, locations, npcs, organizations, encounters, combats] = await Promise.all([
    database.players.filter(inCampaign(id)).toArray(),
    database.locations.filter(inCampaign(id)).toArray(),
    database.npcs.filter(inCampaign(id)).toArray(),
    database.organizations.filter(inCampaign(id)).toArray(),
    database.encounters.filter(inCampaign(id)).toArray(),
    database.combats.filter(inCampaign(id)).toArray(),
  ]);
  return { players, locations, npcs, organizations, encounters, combats };
}

/** Deletes a campaign with its players, locations, NPCs, organizations, encounters and combats. Stat blocks are shared and stay. */
export async function deleteCampaign(id: ID, database: TrackerDB = db): Promise<void> {
  const tables = [database.campaigns, database.players, database.locations, database.npcs, database.organizations, database.encounters, database.combats, database.deletions];
  await database.transaction('rw', tables, async () => {
    const contents = await campaignContents(id, database);
    const deletedAt = Date.now();
    const doomed: Tombstone[] = [
      { table: 'campaigns', id, deletedAt },
      ...contents.players.map((r) => ({ table: 'players' as const, id: r.id, deletedAt })),
      ...contents.locations.map((r) => ({ table: 'locations' as const, id: r.id, deletedAt })),
      ...contents.npcs.map((r) => ({ table: 'npcs' as const, id: r.id, deletedAt })),
      ...contents.organizations.map((r) => ({ table: 'organizations' as const, id: r.id, deletedAt })),
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

/** Id prefix of the spells that earlier versions added on their own (`updatedAt` 0 until edited). */
const BUNDLED_SPELL_PREFIX = 'srd-2024_';

/**
 * Removes the spells earlier versions of the app added by default, leaving any the user edited.
 * Deletions are tombstoned, so devices still on an old version drop them too instead of syncing
 * them back. Safe to run at every start. Returns how many were removed.
 */
export async function removeBundledSpells(database: TrackerDB = db): Promise<number> {
  const removed = await database.transaction('rw', database.spells, database.deletions, async () => {
    const ids = (await database.spells.where('id').startsWith(BUNDLED_SPELL_PREFIX).toArray())
      .filter((s) => !s.updatedAt)
      .map((s) => s.id);
    if (ids.length === 0) return 0;
    const deletedAt = Date.now();
    await database.spells.bulkDelete(ids);
    await database.deletions.bulkPut(
      ids.map((id) => {
        const t: Tombstone = { table: 'spells', id, deletedAt };
        return { ...t, key: tombstoneKey(t) };
      }),
    );
    return ids.length;
  });
  if (removed) changed();
  return removed;
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

// ---------- items ----------

export async function saveItem(i: Item, database: TrackerDB = db): Promise<void> {
  await database.items.put({ ...i, updatedAt: Date.now() });
  changed();
}

export async function deleteItem(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'items', id);
}

export async function exportItems(ids?: readonly ID[], database: TrackerDB = db): Promise<BackupFile> {
  const items = ids
    ? (await database.items.bulkGet([...ids])).filter((i): i is Item => !!i)
    : await database.items.toArray();
  return { app: 'dm-combat-tracker', version: 1, exportedAt: new Date().toISOString(), creatures: [], items };
}

/**
 * Imports items from a backup file (its `items`), a bare array, an object with a `results` or
 * `equipment` list (as public 5e APIs return), or a single item. Entries without a name are skipped.
 * Imported items count as edited now, so sync treats them as the newest copy.
 */
export async function importItems(data: unknown, database: TrackerDB = db): Promise<ImportResult> {
  const o = data as { items?: unknown; results?: unknown; equipment?: unknown } | null;
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray(o?.items)
      ? o.items
      : Array.isArray(o?.results)
        ? o.results
        : Array.isArray(o?.equipment)
          ? o.equipment
          : data && typeof data === 'object' && 'name' in data
            ? [data]
            : [];
  if (list.length === 0) throw new Error('No items found in file.');
  const now = Date.now();
  const valid = list
    .map(normalizeItem)
    .filter((i): i is Item => i !== null)
    .map((i) => ({ ...i, updatedAt: now }));
  if (valid.length === 0) throw new Error('No items with a name found in file.');
  const existing = (await database.items.bulkGet(valid.map((i) => i.id))).filter(Boolean).length;
  await database.items.bulkPut(valid);
  changed();
  return { added: valid.length - existing, replaced: existing, skipped: list.length - valid.length };
}

// ---------- players ----------

export async function savePlayer(p: Player, database: TrackerDB = db): Promise<void> {
  await database.players.put({ ...p, updatedAt: Date.now() });
  changed();
}

export async function deletePlayer(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'players', id);
}

// ---------- locations ----------

/**
 * Saves a location with the given children (see `planLocationSave`), updating the other locations
 * whose parent or sibling links change.
 */
export async function saveLocation(loc: Location, childIds: readonly ID[], database: TrackerDB = db): Promise<void> {
  await database.transaction('rw', database.locations, async () => {
    const all = await database.locations.filter(inCampaign(loc.campaignId)).toArray();
    const now = Date.now();
    await database.locations.bulkPut(planLocationSave(all, loc, childIds).map((l) => ({ ...l, updatedAt: now })));
  });
  changed();
}

/** Fills a location's shop back up: every item with a maximum stock goes back to it. */
export async function restockLocation(id: ID, database: TrackerDB = db): Promise<void> {
  await database.transaction('rw', database.locations, async () => {
    const loc = await database.locations.get(id);
    if (!loc?.shop || !needsRestock(loc.shop)) return;
    await database.locations.put({ ...loc, shop: restockShop(loc.shop), updatedAt: Date.now() });
  });
  changed();
}

/** Sells one of a shop item: its stock goes down by one (see `sellOne`). */
export async function sellShopItem(locationId: ID, rowId: ID, database: TrackerDB = db): Promise<void> {
  await database.transaction('rw', database.locations, async () => {
    const loc = await database.locations.get(locationId);
    if (!loc?.shop) return;
    const shop = sellOne(loc.shop, rowId);
    if (shop.every((row, n) => row === loc.shop![n])) return;
    await database.locations.put({ ...loc, shop, updatedAt: Date.now() });
  });
  changed();
}

/**
 * Deletes a location. The places inside it and the NPCs living there move up to its parent; sibling
 * links to it are dropped.
 */
export async function deleteLocation(id: ID, database: TrackerDB = db): Promise<void> {
  await database.transaction('rw', database.locations, database.npcs, database.deletions, async () => {
    const gone = await database.locations.get(id);
    if (gone) {
      const all = await database.locations.filter(inCampaign(gone.campaignId)).toArray();
      const now = Date.now();
      await database.locations.bulkPut(planLocationDelete(all, id).map((l) => ({ ...l, updatedAt: now })));
      const residents = await database.npcs.where('locationId').equals(id).toArray();
      await database.npcs.bulkPut(residents.map((n) => ({ ...withLocation(n, gone.parentId), updatedAt: now })));
    }
    await database.locations.delete(id);
    const t: Tombstone = { table: 'locations', id, deletedAt: Date.now() };
    await database.deletions.put({ ...t, key: tombstoneKey(t) });
  });
  changed();
}

// ---------- NPCs ----------

function withLocation(npc: Npc, locationId: ID | undefined): Npc {
  const { locationId: _old, ...rest } = npc;
  return locationId ? { ...rest, locationId } : rest;
}

/** The NPC in these organizations, dropping the field when there are none. */
function withOrganizations(npc: Npc, ids: readonly ID[]): Npc {
  const { organizationIds: _old, ...rest } = npc;
  const unique = [...new Set(ids)];
  return unique.length ? { ...rest, organizationIds: unique } : rest;
}

export async function saveNpc(n: Npc, database: TrackerDB = db): Promise<void> {
  await database.npcs.put({ ...withOrganizations(withLocation(n, n.locationId), n.organizationIds ?? []), updatedAt: Date.now() });
  changed();
}

export async function deleteNpc(id: ID, database: TrackerDB = db): Promise<void> {
  await deleteWithTombstone(database, 'npcs', id);
}

/**
 * Makes these the NPCs living at a location: the listed ones move here (from wherever they lived),
 * NPCs who lived here but aren't listed now have no location, and new names become new NPCs here.
 */
export async function setLocationNpcs(
  locationId: ID,
  campaignId: ID,
  npcIds: readonly ID[],
  newNames: readonly string[],
  database: TrackerDB = db,
): Promise<void> {
  await database.transaction('rw', database.npcs, async () => {
    const all = await database.npcs.filter(inCampaign(campaignId)).toArray();
    const wanted = new Set(npcIds);
    const now = Date.now();
    const puts: Npc[] = [];
    for (const n of all) {
      if (wanted.has(n.id) && n.locationId !== locationId) puts.push(withLocation(n, locationId));
      else if (!wanted.has(n.id) && n.locationId === locationId) puts.push(withLocation(n, undefined));
    }
    for (const raw of newNames) {
      const name = raw.trim();
      if (name) puts.push({ id: newId(), campaignId, name, locationId });
    }
    if (puts.length) await database.npcs.bulkPut(puts.map((n) => ({ ...n, updatedAt: now })));
  });
  changed();
}

// ---------- organizations ----------

export async function saveOrganization(o: Organization, database: TrackerDB = db): Promise<void> {
  await database.organizations.put({ ...o, updatedAt: Date.now() });
  changed();
}

/** Deletes an organization. Its members stay, just no longer in it. */
export async function deleteOrganization(id: ID, database: TrackerDB = db): Promise<void> {
  await database.transaction('rw', database.organizations, database.npcs, database.deletions, async () => {
    const members = await database.npcs.where('organizationIds').equals(id).toArray();
    const now = Date.now();
    await database.npcs.bulkPut(members.map((n) => ({ ...withOrganizations(n, (n.organizationIds ?? []).filter((x) => x !== id)), updatedAt: now })));
    await database.organizations.delete(id);
    const t: Tombstone = { table: 'organizations', id, deletedAt: now };
    await database.deletions.put({ ...t, key: tombstoneKey(t) });
  });
  changed();
}

/** Makes these NPCs (in the organization's campaign) its members: the listed ones join, the others leave. */
export async function setOrganizationMembers(organizationId: ID, campaignId: ID, npcIds: readonly ID[], database: TrackerDB = db): Promise<void> {
  await database.transaction('rw', database.npcs, async () => {
    const all = await database.npcs.filter(inCampaign(campaignId)).toArray();
    const wanted = new Set(npcIds);
    const now = Date.now();
    const puts: Npc[] = [];
    for (const n of all) {
      const ids = n.organizationIds ?? [];
      const member = ids.includes(organizationId);
      if (wanted.has(n.id) && !member) puts.push(withOrganizations(n, [...ids, organizationId]));
      else if (!wanted.has(n.id) && member) puts.push(withOrganizations(n, ids.filter((x) => x !== organizationId)));
    }
    if (puts.length) await database.npcs.bulkPut(puts.map((n) => ({ ...n, updatedAt: now })));
  });
  changed();
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
  /** The exported item list. */
  items?: Item[];
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
  const [campaigns, creatures, spells, items, players, locations, npcs, organizations, encounters, combats, deletions] = await Promise.all([
    database.campaigns.toArray(),
    database.creatures.toArray(),
    database.spells.toArray(),
    database.items.toArray(),
    database.players.toArray(),
    database.locations.toArray(),
    database.npcs.toArray(),
    database.organizations.toArray(),
    database.encounters.toArray(),
    database.combats.toArray(),
    database.deletions.toArray(),
  ]);
  return { campaigns, creatures, spells, items, players, locations, npcs, organizations, encounters, combats, deletions: deletions.map(({ key: _key, ...t }) => t) };
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
