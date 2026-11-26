import {
  ARMOR_TYPES,
  DAMAGE_TYPES,
  ITEM_CATEGORIES,
  TOOL_TYPES,
  type ArmorDetails,
  type ArmorType,
  type DamageType,
  type Item,
  type ItemCategory,
  type ToolDetails,
  type ToolType,
  type WeaponDetails,
} from '../models';
import { newId } from './ids';

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: 'Weapons',
  armor: 'Armor',
  tool: 'Tools',
  gear: 'Adventuring Gear',
};

export const ARMOR_TYPE_LABELS: Record<ArmorType, string> = {
  light: 'Light armor',
  medium: 'Medium armor',
  heavy: 'Heavy armor',
  shield: 'Shield',
};

export const TOOL_TYPE_LABELS: Record<ToolType, string> = {
  artisan: "Artisan's tools",
  gaming: 'Gaming set',
  musical: 'Musical instrument',
  other: 'Other tool',
};

export const DEFAULT_WEAPON: WeaponDetails = { class: 'simple', range: 'melee', damage: '1d6', damageType: 'slashing', properties: '' };
export const DEFAULT_ARMOR: ArmorDetails = { type: 'light', ac: '', strength: 0, stealthDisadvantage: false };
export const DEFAULT_TOOL: ToolDetails = { type: 'artisan' };

export function blankItem(category: ItemCategory = 'gear'): Item {
  const now = Date.now();
  return { id: newId(), name: '', category, cost: '', weight: '', description: '', createdAt: now, updatedAt: now };
}

export const weaponOf = (i: Pick<Item, 'weapon'>): WeaponDetails => ({ ...DEFAULT_WEAPON, ...i.weapon });
export const armorOf = (i: Pick<Item, 'armor'>): ArmorDetails => ({ ...DEFAULT_ARMOR, ...i.armor });
export const toolOf = (i: Pick<Item, 'tool'>): ToolDetails => ({ ...DEFAULT_TOOL, ...i.tool });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Martial melee weapon", "Medium armor", "Gaming set", "Adventuring gear": printed under the name. */
export function itemSubtitle(i: Item): string {
  switch (i.category) {
    case 'weapon': {
      const w = weaponOf(i);
      return `${capitalize(w.class)} ${w.range} weapon`;
    }
    case 'armor':
      return ARMOR_TYPE_LABELS[armorOf(i).type];
    case 'tool':
      return TOOL_TYPE_LABELS[toolOf(i).type];
    default:
      return 'Adventuring gear';
  }
}

/** "1d8 slashing", or '' when the weapon deals no damage. */
export function weaponDamage(w: WeaponDetails): string {
  return w.damage.trim() ? `${w.damage.trim()} ${w.damageType}` : '';
}

/** The details the list shows for an item: damage for weapons, AC for armor. */
export function itemSummary(i: Item): string {
  if (i.category === 'weapon') return weaponDamage(weaponOf(i));
  if (i.category === 'armor') {
    const ac = armorOf(i).ac.trim();
    return ac ? `AC ${ac}` : '';
  }
  return '';
}

/**
 * Moves an item to another category, filling in that category's details with defaults if it has
 * none yet. Details of the other categories stay, so switching back restores them.
 */
export function withCategory(i: Item, category: ItemCategory): Item {
  const next: Item = { ...i, category };
  if (category === 'weapon') next.weapon = weaponOf(i);
  if (category === 'armor') next.armor = armorOf(i);
  if (category === 'tool') next.tool = toolOf(i);
  return next;
}

export function validateItem(i: Item): string[] {
  const errors: string[] = [];
  if (!i.name.trim()) errors.push('Name is required.');
  if (i.category === 'armor') {
    const s = armorOf(i).strength;
    if (!Number.isInteger(s) || s < 0 || s > 30) errors.push('Strength requirement must be between 0 and 30.');
  }
  return errors;
}

// ---------- cost & weight ----------

const COIN_VALUES: Record<string, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

/** A cost such as "15 gp", "1,500 gp" or "5 sp" in copper pieces; undefined when it isn't one. */
export function costInCopper(cost: string): number | undefined {
  const m = cost
    .trim()
    .toLowerCase()
    .match(/^(\d[\d,]*(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)\b/);
  return m ? Number(m[1]!.replace(/,/g, '')) * COIN_VALUES[m[2]!]! : undefined;
}

/** A weight such as "3 lb.", "1/2 lb." or "1,000 lb" in pounds; undefined when it isn't one. */
export function weightInPounds(weight: string): number | undefined {
  const m = weight
    .trim()
    .toLowerCase()
    .match(/^(\d[\d,]*(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*(lbs?\.?|pounds?)?$/);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(/,/g, ''));
  return m[2] ? n / Number(m[2]) : n;
}

// ---------- search & filter ----------

export const ITEM_SORTS = ['name', 'category', 'cost', 'weight'] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export interface ItemFilter {
  query?: string;
  /** '' = every category. */
  category?: string;
  /** Defaults to 'name'. */
  sort?: ItemSort;
  /** Reverse the sort column. Items whose cost or weight can't be read stay last either way. */
  desc?: boolean;
}

export function filterItems(list: readonly Item[], f: ItemFilter = {}): Item[] {
  const q = f.query?.trim().toLowerCase() ?? '';
  const category = f.category ?? '';
  return list
    .filter((i) => (!q || i.name.toLowerCase().includes(q)) && (!category || i.category === category))
    .sort(itemComparator(f.sort, f.desc));
}

function byNumber(get: (i: Item) => number | undefined, dir: number, tie: (a: Item, b: Item) => number) {
  return (a: Item, b: Item) => {
    const va = get(a);
    const vb = get(b);
    if (va === vb) return tie(a, b);
    if (va === undefined || vb === undefined) return va === undefined ? 1 : -1;
    return dir * (va - vb) || tie(a, b);
  };
}

function itemComparator(sort: ItemSort = 'name', desc = false): (a: Item, b: Item) => number {
  const dir = desc ? -1 : 1;
  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);
  switch (sort) {
    case 'category':
      return (a, b) => dir * (ITEM_CATEGORIES.indexOf(a.category) - ITEM_CATEGORIES.indexOf(b.category)) || byName(a, b);
    case 'cost':
      return byNumber((i) => costInCopper(i.cost), dir, byName);
    case 'weight':
      return byNumber((i) => weightInPounds(i.weight), dir, byName);
    default:
      return (a, b) => dir * byName(a, b);
  }
}

export function countByCategory(list: readonly Item[]): Record<ItemCategory, number> {
  const counts = { weapon: 0, armor: 0, tool: 0, gear: 0 };
  for (const i of list) counts[i.category]++;
  return counts;
}

// ---------- import normalisation ----------

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number'
      ? String(v)
      : Array.isArray(v)
        ? v.filter((x) => typeof x === 'string').join('\n\n')
        : '';
/** A plain string, or the `name` of an object (as public 5e APIs nest categories and damage types). */
const named = (v: unknown): string => (v && typeof v === 'object' && !Array.isArray(v) ? text(obj(v).name) : text(v)).trim();
const yes = (v: unknown): boolean => v === true || (typeof v === 'string' && /^(yes|true)$/i.test(v.trim()));
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const oneOf = <T extends string>(list: readonly T[], v: string): T | undefined => list.find((x) => v.toLowerCase().startsWith(x));

function parseCategory(o: Record<string, unknown>): ItemCategory {
  const raw = (named(o.category) || named(o.equipment_category)).toLowerCase();
  if (/weapon/.test(raw)) return 'weapon';
  if (/armou?r|shield/.test(raw)) return 'armor';
  if (/tool|instrument|gaming/.test(raw)) return 'tool';
  if ((ITEM_CATEGORIES as readonly string[]).includes(raw)) return raw as ItemCategory;
  if (o.weapon || o.damage || o.weapon_category) return 'weapon';
  if (o.armor || o.armor_class || o.armor_category) return 'armor';
  if (o.tool || o.tool_category) return 'tool';
  return 'gear';
}

/** "15 gp" from text, a bare number (gp), or `{ quantity, unit }`. */
function parseCost(v: unknown): string {
  if (typeof v === 'number') return `${v} gp`;
  const o = obj(v);
  if ('quantity' in o) return `${text(o.quantity)} ${text(o.unit) || 'gp'}`.trim();
  return text(v).trim();
}

function parseWeight(v: unknown): string {
  if (typeof v === 'number') return v ? `${v} lb.` : '';
  return text(v).trim();
}

function parseWeapon(o: Record<string, unknown>): WeaponDetails {
  const w = obj(o.weapon);
  const damage = obj(w.damage ?? o.damage);
  const damageType = named(w.damageType ?? damage.damage_type ?? damage.damageType).toLowerCase();
  const properties = Array.isArray(o.properties) ? o.properties.map(named).filter(Boolean).join(', ') : text(w.properties ?? o.properties);
  const cls = text(w.class ?? o.weapon_category).toLowerCase();
  const range = text(w.range ?? o.weapon_range).toLowerCase();
  return {
    class: cls.startsWith('martial') ? 'martial' : 'simple',
    range: range.startsWith('ranged') ? 'ranged' : 'melee',
    damage: (typeof (w.damage ?? o.damage) === 'string' ? text(w.damage ?? o.damage) : text(damage.damage_dice ?? damage.dice)).trim(),
    damageType: (DAMAGE_TYPES as readonly string[]).includes(damageType) ? (damageType as DamageType) : DEFAULT_WEAPON.damageType,
    properties: properties.trim(),
  };
}

function parseArmor(o: Record<string, unknown>): ArmorDetails {
  const a = obj(o.armor);
  const typeText = text(a.type ?? o.armor_category).toLowerCase();
  const acRaw = a.ac ?? o.armor_class;
  let ac = text(acRaw).trim();
  if (acRaw && typeof acRaw === 'object') {
    const c = obj(acRaw);
    const base = num(c.base) ?? 0;
    const max = num(c.max_bonus);
    ac = c.dex_bonus === true ? `${base} + Dex modifier${max !== undefined ? ` (max ${max})` : ''}` : String(base);
  }
  const type = oneOf(ARMOR_TYPES, typeText) ?? DEFAULT_ARMOR.type;
  if (type === 'shield' && /^\d+$/.test(ac)) ac = `+${ac}`;
  return {
    type,
    ac,
    strength: Math.min(30, Math.max(0, Math.floor(num(a.strength ?? o.str_minimum) ?? 0))),
    stealthDisadvantage: yes(a.stealthDisadvantage ?? o.stealth_disadvantage),
  };
}

function parseTool(o: Record<string, unknown>): ToolDetails {
  const raw = text(obj(o.tool).type ?? named(o.tool_category)).toLowerCase();
  const type: ToolType = /artisan/.test(raw)
    ? 'artisan'
    : /gaming/.test(raw)
      ? 'gaming'
      : /musical|instrument/.test(raw)
        ? 'musical'
        : (oneOf(TOOL_TYPES, raw) ?? (raw ? 'other' : DEFAULT_TOOL.type));
  return { type };
}

/**
 * Turns an imported item into a valid Item. Understands this app's own format plus the common shape
 * of public 5e equipment data (categories as objects, cost as `{ quantity, unit }`, weight in pounds,
 * damage and armor class objects, "desc" paragraphs). Returns null when it has no name.
 */
export function normalizeItem(raw: unknown): Item | null {
  const o = obj(raw);
  const name = text(o.name).trim();
  if (!name) return null;
  const base = blankItem(parseCategory(o));
  const item: Item = {
    id: text(o.id) || base.id,
    name,
    category: base.category,
    cost: parseCost(o.cost),
    weight: parseWeight(o.weight),
    description: text(o.description ?? o.desc).trim(),
    createdAt: num(o.createdAt) ?? base.createdAt,
    updatedAt: num(o.updatedAt) ?? base.updatedAt,
  };
  if (item.category === 'weapon' || o.weapon) item.weapon = parseWeapon(o);
  if (item.category === 'armor' || o.armor) item.armor = parseArmor(o);
  if (item.category === 'tool' || o.tool) item.tool = parseTool(o);
  return item;
}
