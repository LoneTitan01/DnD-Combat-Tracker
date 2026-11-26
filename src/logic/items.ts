import {
  ARMOR_TYPES,
  DAMAGE_TYPES,
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  MAGIC_EFFECT_KINDS,
  TOOL_TYPES,
  type ArmorDetails,
  type ArmorType,
  type DamageType,
  type ID,
  type Item,
  type ItemCategory,
  type ItemRarity,
  type MagicDetails,
  type MagicEffect,
  type MagicEffectKind,
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

// ---------- magic ----------

export const MAGIC_EFFECT_LABELS: Record<MagicEffectKind, string> = {
  spell: 'Spell',
  action: 'Action',
  passive: 'Passive',
};

export const DEFAULT_MAGIC: MagicDetails = { rarity: 'uncommon', attunement: false, attunementBy: '', bonus: 0, effects: [] };

export const MAX_MAGIC_BONUS = 10;

export const magicOf = (i: Pick<Item, 'magic'>): MagicDetails | undefined =>
  i.magic ? { ...DEFAULT_MAGIC, ...i.magic, effects: i.magic.effects ?? [] } : undefined;

/** The +N enchantment, for the categories it applies to (weapons and armor); 0 otherwise. */
export function magicBonus(i: Pick<Item, 'magic' | 'category'>): number {
  if (i.category !== 'weapon' && i.category !== 'armor') return 0;
  return magicOf(i)?.bonus ?? 0;
}

export function blankMagicEffect(kind: MagicEffectKind = 'action'): MagicEffect {
  return { id: newId(), kind, name: '', description: '', uses: 0, recharge: '' };
}

/** Makes an item magical (with defaults) or mundane. Turning magic off drops its magic details. */
export function withMagic(i: Item, on: boolean): Item {
  if (on) return { ...i, magic: magicOf(i) ?? { ...DEFAULT_MAGIC } };
  const { magic: _magic, ...rest } = i;
  return rest;
}

/** "rare (requires attunement by a wizard)": the magic part of the subtitle. */
export function rarityLine(m: MagicDetails): string {
  if (!m.attunement) return m.rarity;
  const by = m.attunementBy.trim();
  return `${m.rarity} (requires attunement${by ? ` ${by}` : ''})`;
}

/** "3 charges, recharges at dawn", "1/long rest", or '' for unlimited. */
export function effectUses(e: Pick<MagicEffect, 'kind' | 'uses' | 'recharge'>): string {
  if (e.kind === 'passive' || e.uses <= 0) return '';
  const r = e.recharge.trim();
  if (!r) return `${e.uses} ${e.uses === 1 ? 'use' : 'uses'}`;
  return `${e.uses}/${r}`;
}

/** An effect's heading: its name, or for a spell without one, the linked spell's name. */
export function effectName(e: MagicEffect, spellName?: (id: ID) => string | undefined): string {
  return e.name.trim() || (e.spellId ? (spellName?.(e.spellId) ?? '') : '');
}

// ---------- display ----------

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** "Martial melee weapon", "Medium armor", "Gaming set", "Adventuring gear". */
export function itemType(i: Item): string {
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

/** The line under an item's name: "Martial melee weapon", or "Martial melee weapon, rare (requires attunement)". */
export function itemSubtitle(i: Item): string {
  const m = magicOf(i);
  return m ? `${itemType(i)}, ${rarityLine(m)}` : itemType(i);
}

/** The item with this name, ignoring case and surrounding spaces. */
export function findItemByName<T extends Pick<Item, 'name'>>(list: readonly T[], name: string): T | undefined {
  const n = name.trim().toLowerCase();
  return n ? list.find((i) => i.name.trim().toLowerCase() === n) : undefined;
}

/** "1d8 slashing" ("1d8 + 1 slashing" with a +1 bonus), or '' when the weapon deals no damage. */
export function weaponDamage(w: WeaponDetails, bonus = 0): string {
  const dice = w.damage.trim();
  if (!dice) return '';
  return bonus ? `${dice} ${bonus < 0 ? '−' : '+'} ${Math.abs(bonus)} ${w.damageType}` : `${dice} ${w.damageType}`;
}

/** "+1 to attack and damage rolls" / "+2 to AC", or '' without a bonus. */
export function bonusLine(i: Item): string {
  const b = magicBonus(i);
  if (!b) return '';
  return i.category === 'weapon' ? `${signed(b)} to attack and damage rolls` : `${signed(b)} to AC`;
}

/** The details the list shows for an item: damage for weapons, AC for armor, with any magic bonus. */
export function itemSummary(i: Item): string {
  const b = magicBonus(i);
  if (i.category === 'weapon') {
    const dmg = weaponDamage(weaponOf(i), b);
    return b ? [`${signed(b)} to hit`, dmg].filter(Boolean).join(', ') : dmg;
  }
  if (i.category === 'armor') {
    const ac = armorOf(i).ac.trim();
    const parts = [ac ? `AC ${ac}` : '', b ? `${signed(b)} AC` : ''].filter(Boolean);
    return parts.join(', ');
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
  const m = magicOf(i);
  if (m) {
    if (!Number.isInteger(m.bonus) || m.bonus < 0 || m.bonus > MAX_MAGIC_BONUS)
      errors.push(`Magic bonus must be between 0 and ${MAX_MAGIC_BONUS}.`);
    if (m.effects.some((e) => e.kind === 'spell' && !e.spellId && !e.name.trim()))
      errors.push('Every spell effect needs a spell from the spell list or a name.');
    if (m.effects.some((e) => e.kind !== 'spell' && !e.name.trim())) errors.push('Every action and passive needs a name.');
    if (m.effects.some((e) => !Number.isInteger(e.uses) || e.uses < 0 || e.uses > 99))
      errors.push('Uses must be between 0 and 99.');
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

export const ITEM_SORTS = ['name', 'category', 'rarity', 'cost', 'weight'] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export interface ItemFilter {
  query?: string;
  /** '' = every category. */
  category?: string;
  /** Only magic items. */
  magic?: boolean;
  /** Defaults to 'name'. */
  sort?: ItemSort;
  /** Reverse the sort column. Items whose cost or weight can't be read stay last either way. */
  desc?: boolean;
}

export function filterItems(list: readonly Item[], f: ItemFilter = {}): Item[] {
  const q = f.query?.trim().toLowerCase() ?? '';
  const category = f.category ?? '';
  return list
    .filter(
      (i) => (!q || i.name.toLowerCase().includes(q)) && (!category || i.category === category) && (!f.magic || !!i.magic),
    )
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
    case 'rarity':
      return byNumber((i) => (i.magic ? ITEM_RARITIES.indexOf(magicOf(i)!.rarity) : undefined), dir, byName);
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

function parseEffect(raw: unknown): MagicEffect | null {
  const o = obj(raw);
  const kindText = text(o.kind).toLowerCase();
  const kind = (MAGIC_EFFECT_KINDS as readonly string[]).includes(kindText) ? (kindText as MagicEffectKind) : 'action';
  const name = text(o.name).trim();
  const spellId = text(o.spellId).trim();
  if (!name && !(kind === 'spell' && spellId)) return null;
  const effect: MagicEffect = {
    id: text(o.id) || newId(),
    kind,
    name,
    description: text(o.description ?? o.desc).trim(),
    uses: Math.min(99, Math.max(0, Math.floor(num(o.uses ?? o.charges) ?? 0))),
    recharge: text(o.recharge).trim(),
  };
  if (kind === 'spell' && spellId) effect.spellId = spellId;
  return effect;
}

/** "+1 Longsword", "Longsword, +2", "Shield +3": the bonus in a magic weapon's or armor's name. */
const nameBonus = (name: string): number | undefined => {
  const m = name.match(/(?:^|[\s,(])\+(\d+)\b/);
  return m ? Math.min(MAX_MAGIC_BONUS, Number(m[1])) : undefined;
};

/**
 * Magic details from this app's `magic` object, or from public 5e magic item data: a `rarity`
 * (text or `{ name }`) and a first description line such as "Weapon (any sword), rare (requires
 * attunement by a paladin)". A bonus is read from the name ("+1 Longsword") when none is given.
 */
function parseMagic(o: Record<string, unknown>, name: string, description: string): MagicDetails | undefined {
  const m = obj(o.magic);
  const own = !!o.magic && typeof o.magic === 'object';
  const rarityText = (named(m.rarity) || named(o.rarity)).toLowerCase();
  if (!own && !rarityText) return undefined;
  const rarity =
    ITEM_RARITIES.find((r) => rarityText === r) ??
    // "Varies", "Rare (+2)" and similar: the first rarity named, longest first so "very rare" wins over "rare".
    [...ITEM_RARITIES].sort((a, b) => b.length - a.length).find((r) => rarityText.includes(r)) ??
    DEFAULT_MAGIC.rarity;
  const attuneMatch = description.match(/requires attunement([^)\n]*)/i);
  const attunement = 'attunement' in m ? yes(m.attunement) : yes(o.requires_attunement) || !!attuneMatch;
  const attunementBy = text(m.attunementBy).trim() || (attuneMatch?.[1] ?? '').trim();
  const bonus = Math.min(MAX_MAGIC_BONUS, Math.max(0, Math.floor(num(m.bonus) ?? nameBonus(name) ?? 0)));
  const effects = (Array.isArray(m.effects) ? m.effects : []).map(parseEffect).filter((e): e is MagicEffect => e !== null);
  return { rarity: rarity as ItemRarity, attunement, attunementBy: attunement ? attunementBy : '', bonus, effects };
}

/**
 * Turns an imported item into a valid Item. Understands this app's own format plus the common shape
 * of public 5e equipment and magic item data (categories as objects, cost as `{ quantity, unit }`,
 * weight in pounds, damage and armor class objects, "desc" paragraphs, rarity). Returns null when it
 * has no name.
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
  const magic = parseMagic(o, name, item.description);
  if (magic) item.magic = magic;
  return item;
}
