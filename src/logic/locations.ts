import { ARMOR_TYPES, ITEM_CATEGORIES, TOOL_TYPES, WEAPON_CLASSES, type ID, type Item, type ItemCategory, type Location, type Npc, type ShopItem } from '../models';
import { newId } from './ids';
import { ARMOR_TYPE_LABELS, costInCopper, ITEM_CATEGORY_LABELS, TOOL_TYPE_LABELS, armorOf, toolOf, weaponOf } from './items';

export function blankLocation(campaignId: ID, parentId?: ID): Location {
  const now = Date.now();
  return {
    id: newId(),
    campaignId,
    name: '',
    ...(parentId ? { parentId } : {}),
    siblingIds: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}

const byName = (a: Location, b: Location) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function sortLocations(list: readonly Location[]): Location[] {
  return [...list].sort(byName);
}

export function childrenOf(list: readonly Location[], id: ID): Location[] {
  return sortLocations(list.filter((l) => l.parentId === id));
}

/** The places a location is inside of, outermost first. Stops at a missing parent or a loop. */
export function ancestorsOf(list: readonly Location[], loc: Location): Location[] {
  const byId = new Map(list.map((l) => [l.id, l]));
  const out: Location[] = [];
  const seen = new Set([loc.id]);
  let parent = loc.parentId ? byId.get(loc.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    out.unshift(parent);
    seen.add(parent.id);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return out;
}

/** Ids of every place inside a location, however deep. */
export function descendantIds(list: readonly Location[], id: ID): Set<ID> {
  const out = new Set<ID>();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const l of list) {
      if (l.parentId === cur && !out.has(l.id) && l.id !== id) {
        out.add(l.id);
        queue.push(l.id);
      }
    }
  }
  return out;
}

/** Locations that can be this one's parent: anything but itself and the places inside it. */
export function parentOptions(list: readonly Location[], id: ID): Location[] {
  const inside = descendantIds(list, id);
  return sortLocations(list.filter((l) => l.id !== id && !inside.has(l.id)));
}

/** Locations that can be put inside this one: anything but itself and the places it's inside of. */
export function childOptions(list: readonly Location[], loc: Location): Location[] {
  const above = new Set(ancestorsOf(list, loc).map((l) => l.id));
  if (loc.parentId) above.add(loc.parentId);
  return sortLocations(list.filter((l) => l.id !== loc.id && !above.has(l.id)));
}

export interface Sibling {
  location: Location;
  /** Linked by hand, rather than only sharing a parent. */
  linked: boolean;
}

/** Linked places (from either side) and places sharing the same parent, by name. */
export function siblingsOf(list: readonly Location[], loc: Location): Sibling[] {
  const out = new Map<ID, Sibling>();
  for (const l of list) {
    if (l.id === loc.id) continue;
    const linked = loc.siblingIds.includes(l.id) || l.siblingIds.includes(loc.id);
    const shared = !!loc.parentId && l.parentId === loc.parentId;
    if (linked || shared) out.set(l.id, { location: l, linked });
  }
  return [...out.values()].sort((a, b) => byName(a.location, b.location));
}

export interface TreeRow {
  location: Location;
  depth: number;
}

/**
 * Every location as an outline: top-level places by name, each followed by the places inside it.
 * Places whose parent is missing count as top-level; places stuck in a loop are listed at the end.
 */
export function locationTree(list: readonly Location[]): TreeRow[] {
  const ids = new Set(list.map((l) => l.id));
  const rows: TreeRow[] = [];
  const seen = new Set<ID>();
  const walk = (l: Location, depth: number) => {
    if (seen.has(l.id)) return;
    seen.add(l.id);
    rows.push({ location: l, depth });
    for (const c of childrenOf(list, l.id)) walk(c, depth + 1);
  };
  for (const l of sortLocations(list.filter((l) => !l.parentId || !ids.has(l.parentId)))) walk(l, 0);
  for (const l of sortLocations(list)) walk(l, 0);
  return rows;
}

/** A shop row for an item from the item list, at the item's list price. */
export function shopItemFor(item: Pick<Item, 'id' | 'name' | 'cost'>): ShopItem {
  return { id: newId(), itemId: item.id, name: item.name, cost: item.cost, description: '' };
}

/** A shop row for something that isn't in the item list: this shop alone sells it. */
export function shopOnlyItem(name: string): ShopItem {
  return { id: newId(), name, cost: '', description: '' };
}

// ---------- stocking a shop in bulk ----------

/** One kind of item a shop can be stocked with: a category, narrowed to a subtype where it has them. */
export interface ShopKind {
  /** "tool:musical", "weapon:simple", "gear". */
  key: string;
  category: ItemCategory;
  label: string;
}

const SUBTYPES: Record<ItemCategory, readonly { key: string; label: string }[]> = {
  weapon: WEAPON_CLASSES.map((c) => ({ key: c, label: c === 'simple' ? 'Simple weapons' : 'Martial weapons' })),
  armor: ARMOR_TYPES.map((t) => ({ key: t, label: t === 'shield' ? 'Shields' : ARMOR_TYPE_LABELS[t] })),
  tool: TOOL_TYPES.map((t) => ({ key: t, label: t === 'other' ? 'Other tools' : `${TOOL_TYPE_LABELS[t]}s` })),
  gear: [],
};

/** Every kind, grouped by category in the item list's order. Gear has no subtypes, so it is one kind. */
export const SHOP_KIND_GROUPS: readonly { category: ItemCategory; label: string; kinds: ShopKind[] }[] = ITEM_CATEGORIES.map(
  (category) => ({
    category,
    label: ITEM_CATEGORY_LABELS[category],
    kinds: SUBTYPES[category].length
      ? SUBTYPES[category].map((s) => ({ key: `${category}:${s.key}`, category, label: s.label }))
      : [{ key: category, category, label: ITEM_CATEGORY_LABELS[category] }],
  }),
);

/** The kind an item is, as a `ShopKind` key. */
export function shopKindOf(i: Item): string {
  switch (i.category) {
    case 'weapon':
      return `weapon:${weaponOf(i).class}`;
    case 'armor':
      return `armor:${armorOf(i).type}`;
    case 'tool':
      return `tool:${toolOf(i).type}`;
    default:
      return i.category;
  }
}

/**
 * A price typed as a bound: "25" is gold, "5 sp" or "1,500 gp" are read as written. In copper; undefined
 * when empty, and NaN when it can't be read.
 */
export function parsePriceBound(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (/^\d[\d,]*(?:\.\d+)?$/.test(t)) return Number(t.replace(/,/g, '')) * 100;
  return costInCopper(t) ?? NaN;
}

export interface ShopStockFilter {
  /** `ShopKind` keys; empty means every kind. */
  kinds: readonly string[];
  /** Price bounds in copper, inclusive. Items whose cost can't be read are left out when either is set. */
  minCost?: number;
  maxCost?: number;
  /** Include magic items. Off by default, since most shops sell mundane goods. */
  magic?: boolean;
}

/**
 * Items from the item list that match the filter and aren't already for sale in `shop`, by kind (in
 * `SHOP_KIND_GROUPS` order), then price, then name.
 */
export function itemsToStock(catalog: readonly Item[], shop: readonly ShopItem[], f: ShopStockFilter): Item[] {
  const stocked = new Set(shop.map((s) => s.itemId));
  const kinds = new Set(f.kinds);
  const order = SHOP_KIND_GROUPS.flatMap((g) => g.kinds.map((k) => k.key));
  const bounded = f.minCost !== undefined || f.maxCost !== undefined;
  const price = (i: Item) => costInCopper(i.cost);
  return catalog
    .filter((i) => {
      if (stocked.has(i.id) || (i.magic && !f.magic)) return false;
      if (kinds.size && !kinds.has(shopKindOf(i))) return false;
      if (!bounded) return true;
      const c = price(i);
      return c !== undefined && (f.minCost === undefined || c >= f.minCost) && (f.maxCost === undefined || c <= f.maxCost);
    })
    .sort(
      (a, b) =>
        order.indexOf(shopKindOf(a)) - order.indexOf(shopKindOf(b)) ||
        (price(a) ?? Infinity) - (price(b) ?? Infinity) ||
        a.name.localeCompare(b.name),
    );
}

/** Sells one of a shop row: its stock goes down by one, never below 0. Rows whose stock isn't counted don't change. */
export function sellOne(shop: readonly ShopItem[], rowId: ID): ShopItem[] {
  return shop.map((i) => (i.id === rowId && i.stock !== undefined && i.stock > 0 ? { ...i, stock: i.stock - 1 } : i));
}

const blankItem = (i: ShopItem) =>
  !i.itemId && !i.name.trim() && !i.cost.trim() && !i.description.trim() && i.stock === undefined && i.maxStock === undefined;

/** A stock count typed into a box: a whole number from 0, or undefined when the box is empty or not a number. */
export function parseStock(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.max(0, n) : undefined;
}

/** "3 / 5", "3" with no maximum, "– / 5" when the current count isn't known; '' when stock isn't counted. */
export function stockLabel(i: Pick<ShopItem, 'stock' | 'maxStock'>): string {
  if (i.maxStock === undefined) return i.stock === undefined ? '' : String(i.stock);
  return `${i.stock ?? '–'} / ${i.maxStock}`;
}

/** Whether restocking would change anything: some item with a maximum is below it. */
export function needsRestock(shop: readonly ShopItem[] = []): boolean {
  return shop.some((i) => i.maxStock !== undefined && i.stock !== i.maxStock);
}

/** Fills every item with a maximum back up to it. Items without one are left as they are. */
export function restockShop(shop: readonly ShopItem[]): ShopItem[] {
  return shop.map((i) => (i.maxStock === undefined ? i : { ...i, stock: i.maxStock }));
}

/** Whole, non-negative stock counts; anything else is dropped. */
const cleanCount = (key: 'stock' | 'maxStock', n: number | undefined) =>
  n !== undefined && Number.isFinite(n) && n >= 0 ? { [key]: Math.floor(n) } : {};

/** Name, notes, shop item and NPC search, ignoring case. `npcs` are the campaign's NPCs, matched to where they live. */
export function filterLocations(
  list: readonly Location[],
  query: string,
  npcs: readonly Pick<Npc, 'name' | 'locationId'>[] = [],
): Location[] {
  const q = query.trim().toLowerCase();
  if (!q) return sortLocations(list);
  const npcHomes = new Set(npcs.filter((n) => n.locationId && n.name.toLowerCase().includes(q)).map((n) => n.locationId));
  return sortLocations(
    list.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.notes.toLowerCase().includes(q) ||
        npcHomes.has(l.id) ||
        (l.shop ?? []).some((i) => i.name.toLowerCase().includes(q)),
    ),
  );
}

export function validateLocation(loc: Location, list: readonly Location[]): string[] {
  const errors: string[] = [];
  if (!loc.name.trim()) errors.push('Give the location a name.');
  if (loc.parentId && (loc.parentId === loc.id || descendantIds(list, loc.id).has(loc.parentId))) {
    errors.push("A location can't be inside a place that's inside it.");
  }
  if ((loc.shop ?? []).some((i) => !i.itemId && !blankItem(i) && !i.name.trim())) errors.push('Give every shop item a name.');
  return errors;
}

/**
 * Trims text, drops repeated siblings and sibling links that point at itself, and drops blank shop
 * rows (leaving no `shop` at all when nothing is for sale).
 */
export function cleanLocation(loc: Location): Location {
  const { parentId, shop, ...rest } = loc;
  const items = (shop ?? [])
    .filter((i) => !blankItem(i))
    .map(({ stock, maxStock, ...i }) => ({
      ...i,
      name: i.name.trim(),
      cost: i.cost.trim(),
      description: i.description.trim(),
      ...cleanCount('stock', stock),
      ...cleanCount('maxStock', maxStock),
    }));
  return {
    ...rest,
    ...(parentId ? { parentId } : {}),
    ...(items.length ? { shop: items } : {}),
    name: loc.name.trim(),
    notes: loc.notes.trim(),
    siblingIds: [...new Set(loc.siblingIds)].filter((id) => id !== loc.id),
  };
}

const sameIds = (a: readonly ID[], b: readonly ID[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Everything to write when a location is saved with the given children: the location itself, plus
 * the other locations whose parent or sibling links change so both sides agree. Children taken from
 * another parent move here; children dropped from the list move up to this location's parent.
 */
export function planLocationSave(list: readonly Location[], edited: Location, childIds: readonly ID[]): Location[] {
  const loc = cleanLocation(edited);
  const out: Location[] = [loc];
  const wanted = new Set(childIds.filter((id) => id !== loc.id && id !== loc.parentId));
  for (const other of list) {
    if (other.id === loc.id) continue;
    let next = other;
    if (wanted.has(other.id) && other.parentId !== loc.id) next = { ...next, parentId: loc.id };
    else if (!wanted.has(other.id) && other.parentId === loc.id) next = withParent(next, loc.parentId);
    const linked = loc.siblingIds.includes(other.id);
    const links = linked
      ? next.siblingIds.includes(loc.id)
        ? next.siblingIds
        : [...next.siblingIds, loc.id]
      : next.siblingIds.filter((id) => id !== loc.id);
    if (!sameIds(links, next.siblingIds)) next = { ...next, siblingIds: links };
    if (next !== other) out.push(next);
  }
  return out;
}

function withParent(loc: Location, parentId: ID | undefined): Location {
  const { parentId: _old, ...rest } = loc;
  return parentId ? { ...rest, parentId } : rest;
}

/**
 * The other locations to update when one is deleted: the places inside it move up to its parent, and
 * sibling links to it are dropped.
 */
export function planLocationDelete(list: readonly Location[], id: ID): Location[] {
  const gone = list.find((l) => l.id === id);
  const out: Location[] = [];
  for (const other of list) {
    if (other.id === id) continue;
    let next = other;
    if (other.parentId === id) next = withParent(next, gone?.parentId);
    if (next.siblingIds.includes(id)) next = { ...next, siblingIds: next.siblingIds.filter((x) => x !== id) };
    if (next !== other) out.push(next);
  }
  return out;
}

