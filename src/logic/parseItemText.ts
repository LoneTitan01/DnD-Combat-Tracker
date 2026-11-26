// Best-effort parsing of items pasted as plain text: a single item's description (a heading, a
// "Martial Melee Weapon" line, "Cost: 15 gp" lines and a description) or a row of an equipment table
// ("Longsword 15 gp 1d8 slashing 3 lb. Versatile (1d10)"). It works out whether the item is a
// weapon, armor, a tool or adventuring gear, and asks when the text doesn't say.

import {
  ARMOR_TYPES,
  DAMAGE_TYPES,
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  type ArmorType,
  type ItemRarity,
  type DamageType,
  type Item,
  type ItemCategory,
  type ToolType,
  type WeaponClass,
  type WeaponRange,
} from '../models';
import { blankItem, DEFAULT_ARMOR, DEFAULT_MAGIC, DEFAULT_TOOL, DEFAULT_WEAPON, MAX_MAGIC_BONUS, withCategory } from './items';
import { append, cleanLines, type Parsed } from './parseText';

export const ITEM_CATEGORY_NAMES: Record<ItemCategory, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  tool: 'Tool',
  gear: 'Adventuring gear',
};

// ---------- what the text says the item is ----------

interface Kind {
  category: ItemCategory;
  weaponClass?: WeaponClass;
  weaponRange?: WeaponRange;
  armorType?: ArmorType;
  toolType?: ToolType;
}

const WEAPONS: Record<string, [WeaponClass, WeaponRange]> = {};
const addWeapons = (cls: WeaponClass, range: WeaponRange, names: string) =>
  names.split(',').forEach((n) => (WEAPONS[n.trim()] = [cls, range]));
addWeapons('simple', 'melee', 'club, dagger, greatclub, handaxe, javelin, light hammer, mace, quarterstaff, sickle, spear');
addWeapons('simple', 'ranged', 'light crossbow, dart, shortbow, sling');
addWeapons(
  'martial',
  'melee',
  'battleaxe, flail, glaive, greataxe, greatsword, halberd, lance, longsword, maul, morningstar, pike, rapier, scimitar, shortsword, trident, war pick, warhammer, whip',
);
addWeapons('martial', 'ranged', 'blowgun, hand crossbow, heavy crossbow, longbow, net, musket, pistol');

const ARMORS: Record<string, ArmorType> = {};
const addArmor = (type: ArmorType, names: string) => names.split(',').forEach((n) => (ARMORS[n.trim()] = type));
addArmor('light', 'padded, padded armor, leather, leather armor, studded leather, studded leather armor');
addArmor('medium', 'hide, hide armor, chain shirt, scale mail, breastplate, half plate, half plate armor, spiked armor');
addArmor('heavy', 'ring mail, chain mail, splint, splint armor, plate, plate armor');
addArmor('shield', 'shield');

const INSTRUMENTS = /^(bagpipes|drum|dulcimer|flute|horn|lute|lyre|pan flute|shawm|viol)$/;
const GAMING = /^(dice set|dragonchess set|playing card set|three-dragon ante set|.* gaming set)$/;
const OTHER_TOOLS = /^(thieves' tools|navigator's tools|disguise kit|forgery kit|herbalism kit|poisoner's kit)$/;
const ARTISAN = /(tools|supplies|utensils)$/;

/** "Crossbow, light" → "light crossbow"; "+1 Longsword (finesse)" → "longsword". */
function baseName(name: string): string {
  let n = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/^\+\d+\s+/, '')
    .replace(/,?\s+\+\d+$/, '')
    .trim();
  const comma = /^([^,]+),\s*([^,]+)$/.exec(n);
  if (comma) n = `${comma[2]} ${comma[1]}`;
  return n.replace(/\s+/g, ' ');
}

/** What the item's name alone gives away, for the weapons, armor and tools of the core rules. */
function kindFromName(name: string): Kind | null {
  const n = baseName(name);
  const weapon = WEAPONS[n] ?? WEAPONS[n.replace(/s$/, '')];
  if (weapon) return { category: 'weapon', weaponClass: weapon[0], weaponRange: weapon[1] };
  const armor = ARMORS[n];
  if (armor) return { category: 'armor', armorType: armor };
  if (INSTRUMENTS.test(n)) return { category: 'tool', toolType: 'musical' };
  if (GAMING.test(n)) return { category: 'tool', toolType: 'gaming' };
  if (OTHER_TOOLS.test(n)) return { category: 'tool', toolType: 'other' };
  if (ARTISAN.test(n) && /'s /.test(n)) return { category: 'tool', toolType: 'artisan' };
  return null;
}

/**
 * A line that names the kind of item: "Martial Melee Weapon", "Light Armor", "Shield",
 * "Artisan's Tools", "Weapon (longsword), rare", "Adventuring Gear". Also a table's section heading.
 */
export function kindFromLine(line: string): Kind | null {
  const l = line.toLowerCase().replace(/\s+/g, ' ').trim();
  if (l.split(' ').length > 6) return null;
  let m = /^(simple|martial)(?: (melee|ranged))? weapons?\b/.exec(l);
  if (m) return { category: 'weapon', weaponClass: m[1] as WeaponClass, weaponRange: m[2] as WeaponRange | undefined };
  m = /^(melee|ranged) weapons?\b(?: \((simple|martial)\b)?/.exec(l);
  if (m) return { category: 'weapon', weaponRange: m[1] as WeaponRange, weaponClass: m[2] as WeaponClass | undefined };
  if (/^weapons?\b/.test(l)) {
    const inner = /^weapons? \(([^)]*)\)/.exec(l)?.[1] ?? '';
    const known = inner ? kindFromName(inner) : null;
    if (known?.category === 'weapon') return known;
    return {
      category: 'weapon',
      weaponClass: /\b(simple|martial)\b/.exec(inner)?.[1] as WeaponClass | undefined,
      weaponRange: /\b(melee|ranged)\b/.exec(inner)?.[1] as WeaponRange | undefined,
    };
  }
  m = /^(light|medium|heavy) armou?r\b/.exec(l);
  if (m) return { category: 'armor', armorType: m[1] as ArmorType };
  if (/^shields?\b/.test(l) && !/^shields? (of|bash)/.test(l)) return { category: 'armor', armorType: 'shield' };
  if (/^armou?r\b/.test(l)) {
    const inner = /^armou?r \(([^)]*)\)/.exec(l)?.[1]?.trim();
    const type = inner ? (ARMOR_TYPES.find((t) => inner.startsWith(t)) ?? ARMORS[inner]) : undefined;
    return { category: 'armor', armorType: type };
  }
  if (/^artisan'?s? tools\b/.test(l)) return { category: 'tool', toolType: 'artisan' };
  if (/^gaming sets?\b/.test(l)) return { category: 'tool', toolType: 'gaming' };
  if (/^musical instruments?\b/.test(l)) return { category: 'tool', toolType: 'musical' };
  if (/^(other )?tools?\b/.test(l)) return { category: 'tool' };
  if (/^(adventuring )?gear\b|^(equipment packs?|ammunition|arcane focus|druidic focus|holy symbol|wondrous item|potion)\b/.test(l))
    return { category: 'gear' };
  return null;
}

// ---------- pieces of text ----------

const COST_RE = /(\d[\d,]*(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)\b/i;
const WEIGHT_RE = /(\d[\d,]*(?:\.\d+)?(?:\s*\/\s*\d+)?)\s*(?:lbs?\b\.?|pounds?\b)/i;
const DAMAGE_RE = new RegExp(`\\b(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?|\\d+)\\s+(${DAMAGE_TYPES.join('|')})\\b`, 'i');
const STRENGTH_RE = /\bstr(?:ength)?\.?\s*(\d{1,2})\b/i;
/** Every armor's AC is 10 or more, or a bonus such as "+2" for a shield. */
const AC_RE = /(?:^|\s)(\+\s*\d+|[1-3]\d)(\s*\+\s*dex(?:terity)?(?:\s*mod(?:ifier)?)?(?:\s*\(\s*max\.?\s*\d+\s*\))?)?(?=\s|$)/i;
const PROPERTY_RE = /\b(ammunition|finesse|heavy|light|loading|reach|special|thrown|two-handed|versatile)\b(\s*\([^)]*\))?/gi;
const MASTERY_RE = /\b(cleave|graze|nick|push|sap|slow|topple|vex)\b/i;

/** Labelled lines: "Cost: 15 gp", "Armor Class 16", "Properties: Finesse, light". */
const LABELS = [
  ['armor class', 'ac'],
  ['damage', 'damage'],
  ['properties', 'properties'],
  ['property', 'properties'],
  ['mastery', 'mastery'],
  ['strength', 'strength'],
  ['stealth', 'stealth'],
  ['category', 'type'],
  ['weight', 'weight'],
  ['price', 'cost'],
  ['cost', 'cost'],
  ['type', 'type'],
  ['rarity', 'rarity'],
  ['attunement', 'attunement'],
  ['str', 'strength'],
  ['ac', 'ac'],
] as const;
type Label = (typeof LABELS)[number][1];
const LABEL_RE = new RegExp(`^(${LABELS.map(([k]) => k.replace(/ /g, '\\s+')).join('|')})\\s*(:|\\s(?=[\\d+]|disadvantage\\b))\\s*(.*)$`, 'i');

function matchLabel(line: string): { label: Label; value: string } | null {
  const m = LABEL_RE.exec(line);
  if (!m) return null;
  const key = m[1]!.toLowerCase().replace(/\s+/g, ' ');
  return { label: LABELS.find(([k]) => k === key)![1], value: m[3]!.trim() };
}

const blankDash = (s: string) => (/^[-—–]+$/.test(s.trim()) ? '' : s.trim());
const normalizeFractions = (s: string) => s.replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4');
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Index of the first digit (or a leading +) outside parentheses: where a table row's name ends. */
function nameEnd(line: string): number {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && i > 0 && line[i - 1] === ' ' && (/\d/.test(c) || ((c === '+' || c === '—') && i + 1 < line.length)))
      return i;
  }
  return -1;
}

/** "Longsword 15 gp 1d8 slashing 3 lb. Versatile" → ["Longsword", "15 gp 1d8 …"], or null for a plain line. */
function splitRow(line: string): [string, string] | null {
  if (matchLabel(line)) return null;
  const at = nameEnd(line);
  if (at <= 0) return null;
  const rest = line.slice(at);
  if (!COST_RE.test(rest) && !WEIGHT_RE.test(rest) && !DAMAGE_RE.test(rest) && !STRENGTH_RE.test(rest) && !/dex/i.test(rest)) return null;
  return [line.slice(0, at).trim().replace(/[,:;]$/, ''), rest];
}

const formatProperties = (found: string[]) => sentence(found.map((p) => p.toLowerCase().replace(/\s+\(/, ' (')).join(', '));

// ---------- the parser ----------

interface Found {
  cost?: string;
  weight?: string;
  damage?: string;
  damageType?: DamageType;
  properties?: string;
  mastery?: string;
  ac?: string;
  strength?: number;
  stealth?: boolean;
  kind?: Kind;
  /** Set for a magic item; '' when its rarity varies. */
  rarity?: ItemRarity | '';
  /** Who can attune to it ("by a wizard"), '' for anyone; undefined when it needs no attunement. */
  attunement?: string;
}

const RARITY_RE = /,\s*(very rare|uncommon|common|rare|legendary|artifact|rarity varies)\b(.*)$/i;
const ATTUNEMENT_RE = /requires attunement([^)]*)/i;

/** "rare", " (requires attunement by a cleric)" → the rarity and attunement of a magic item. */
function readRarity(rarity: string, rest: string, f: Found) {
  const r = rarity.toLowerCase();
  if (r) f.rarity = (ITEM_RARITIES as readonly string[]).includes(r) ? (r as ItemRarity) : '';
  else f.rarity ??= '';
  const attune = ATTUNEMENT_RE.exec(rest);
  if (attune) f.attunement = attune[1]!.trim();
}

/** "+1 Longsword", "Shield, +2": the enchantment bonus in a magic weapon's or armor's name. */
const nameBonus = (name: string): number => Math.min(MAX_MAGIC_BONUS, Number(/(?:^|[\s,(])\+(\d+)\b/.exec(name)?.[1] ?? 0));
const RARITY_FOR_BONUS: Record<number, ItemRarity> = { 1: 'uncommon', 2: 'rare', 3: 'very rare' };

/** Reads the cost, weight, damage, AC and so on out of a table row (everything after the name). */
function readRow(rest: string, f: Found) {
  let r = normalizeFractions(rest);
  const take = (re: RegExp) => {
    const m = re.exec(r);
    if (m) r = r.replace(m[0], ' ');
    return m;
  };
  const cost = take(COST_RE);
  if (cost) f.cost ??= `${cost[1]} ${cost[2]!.toLowerCase()}`;
  const damage = take(DAMAGE_RE);
  if (damage) {
    f.damage ??= damage[1]!.replace(/\s+/g, ' ');
    f.damageType ??= damage[2]!.toLowerCase() as DamageType;
  }
  const weight = take(WEIGHT_RE);
  if (weight) f.weight ??= `${weight[1]!.replace(/\s+/g, '')} lb.`;
  const str = take(STRENGTH_RE);
  if (str) f.strength ??= Number(str[1]);
  if (/\bdisadvantage\b/i.test(r)) {
    f.stealth = true;
    r = r.replace(/\bdisadvantage\b/i, ' ');
  }
  const props = [...r.matchAll(PROPERTY_RE)].map((m) => m[0]);
  if (props.length) f.properties ??= formatProperties(props);
  const mastery = MASTERY_RE.exec(r.replace(PROPERTY_RE, ' '));
  if (mastery) f.mastery ??= sentence(mastery[1]!.toLowerCase());
  const ac = AC_RE.exec(r.replace(PROPERTY_RE, ' '));
  if (ac && (ac[2] || !damage)) {
    const max = ac[2] && /max\D*(\d+)/i.exec(ac[2])?.[1];
    f.ac ??= `${ac[1]!.replace(/\s+/g, '')}${ac[2] ? ' + Dex modifier' : ''}${max ? ` (max ${max})` : ''}`;
  }
}

function readLabel(label: Label, raw: string, f: Found): boolean {
  const value = blankDash(normalizeFractions(raw));
  switch (label) {
    case 'cost':
      f.cost = value.replace(/\b(cp|sp|ep|gp|pp)\b/gi, (u) => u.toLowerCase());
      return true;
    case 'weight':
      f.weight = value;
      return true;
    case 'damage': {
      const m = DAMAGE_RE.exec(value);
      f.damage = m ? m[1]!.replace(/\s+/g, ' ') : value;
      if (m) f.damageType = m[2]!.toLowerCase() as DamageType;
      return true;
    }
    case 'properties':
      f.properties = sentence(value);
      return true;
    case 'mastery':
      f.mastery = sentence(value);
      return true;
    case 'ac':
      f.ac = value
        .replace(/\s*\+\s*dex(?:terity)?(?:\s*mod(?:ifier)?)?/i, ' + Dex modifier')
        .replace(/\(\s*max\.?\s*(\d+)\s*\)/i, '(max $1)');
      return true;
    case 'strength':
      f.strength = Number(/\d+/.exec(value)?.[0] ?? 0);
      return true;
    case 'stealth':
      f.stealth = /disadvantage/i.test(value);
      return true;
    case 'rarity':
      readRarity(/^(very rare|uncommon|common|rare|legendary|artifact)\b/i.exec(value)?.[1] ?? '', value, f);
      return true;
    case 'attunement':
      if (/^(no|none|not required)\b/i.test(value) || !value) return true;
      f.rarity ??= '';
      f.attunement = /\bby\b.*/i.exec(value)?.[0] ?? '';
      return true;
    case 'type': {
      const kind = kindFromLine(value);
      if (!kind) return false;
      f.kind ??= kind;
      return true;
    }
  }
}

/** Light armor has an uncapped Dex bonus, medium a capped one, heavy none; shields add to AC. */
function armorTypeFromAC(ac: string): ArmorType | undefined {
  if (/^\+/.test(ac)) return 'shield';
  if (/dex/i.test(ac)) return /max/i.test(ac) ? 'medium' : 'light';
  if (/^\d+$/.test(ac)) return Number(ac) >= 14 ? 'heavy' : undefined;
  return undefined;
}

export function parseItemText(text: string): Parsed<Item> {
  const item = blankItem('gear');
  const warnings: string[] = [];
  const lines = cleanLines(normalizeFractions(text));
  if (lines.length === 0) return { value: item, warnings: ['Nothing to read: the text is empty.'] };

  const f: Found = {};
  let description = '';
  let nameLine = lines[0]!;
  const row = splitRow(nameLine);
  if (row) {
    [nameLine] = row;
    readRow(row[1], f);
  }
  item.name = nameLine.replace(/[.:]$/, '').trim();

  for (const line of lines.slice(1)) {
    const label = matchLabel(line);
    if (label && readLabel(label.label, label.value, f)) continue;
    // "1 gp, 10 lb." under the name: the row's figures on a line of their own.
    if (!description && /^[\d+]/.test(line) && (COST_RE.test(line) || WEIGHT_RE.test(line) || DAMAGE_RE.test(line))) {
      readRow(` ${line}`, f);
      continue;
    }
    if (!description) {
      // "Wondrous item, rare (requires attunement by a wizard)": the kind, then the rarity.
      const rarity = RARITY_RE.exec(line);
      const head = rarity ? line.slice(0, rarity.index) : line;
      const kind = f.kind ? null : kindFromLine(head);
      if (rarity && head.split(' ').length <= 6) {
        readRarity(rarity[1]!, rarity[2]!, f);
        if (kind) f.kind = kind;
        continue;
      }
      if (kind) {
        f.kind = kind;
        continue;
      }
      if (ATTUNEMENT_RE.test(line) && line.length < 60) {
        readRarity('', line, f);
        continue;
      }
    }
    if (/^description:/i.test(line)) description = append(description, line.replace(/^description:\s*/i, ''));
    else description = append(description, line);
  }
  item.cost = f.cost ?? '';
  item.weight = f.weight ?? '';
  item.description = [f.mastery ? `Mastery: ${f.mastery}` : '', description].filter(Boolean).join('\n\n');

  // What it is: the text saying so wins; otherwise each clue votes, and a tie or no clue at all asks.
  const byName = kindFromName(item.name);
  const clues = new Set<ItemCategory>();
  if (f.damage || f.properties || f.mastery) clues.add('weapon');
  if (f.ac || f.strength) clues.add('armor');
  if (byName) clues.add(byName.category);
  // The text's kind, with whatever the name adds (a "Weapon" line plus a known longsword: martial melee).
  const kind: Kind | undefined = f.kind && {
    ...(byName?.category === f.kind.category ? byName : {}),
    ...stripUndefined(f.kind),
    category: f.kind.category,
  };
  let category: ItemCategory | undefined = kind?.category;
  let detail: string | undefined;
  const describe = (c: ItemCategory) => ITEM_CATEGORY_NAMES[c].toLowerCase();
  if (category && clues.size && !clues.has(category)) {
    // Chain mail under a "Martial Melee Weapons" heading: say which and ask.
    detail = `The text says ${describe(category)}, but it looks like ${[...clues].map(describe).join(' or ')}.`;
    clues.add(category);
    category = undefined;
  } else if (!category) {
    if (clues.size === 1) category = [...clues][0];
    else if (clues.size > 1) {
      const names = ITEM_CATEGORIES.filter((c) => clues.has(c)).map((c) => ITEM_CATEGORY_NAMES[c].toLowerCase());
      detail = `It looks like it could be ${names.join(' or ')}.`;
    } else detail = "The text doesn't say whether it's a weapon, armor, a tool or adventuring gear.";
  }

  // Fill in the details for every category the text has clues for, so answering keeps them.
  const hint = kind ?? byName ?? undefined;
  const isWeapon = category === 'weapon' || clues.has('weapon');
  const isArmor = category === 'armor' || clues.has('armor');
  if (isWeapon) {
    const props = f.properties ?? '';
    item.weapon = {
      class: hint?.weaponClass ?? byName?.weaponClass ?? DEFAULT_WEAPON.class,
      range: hint?.weaponRange ?? byName?.weaponRange ?? (/ammunition/i.test(props) ? 'ranged' : DEFAULT_WEAPON.range),
      damage: f.damage ?? '',
      damageType: f.damageType ?? DEFAULT_WEAPON.damageType,
      properties: props,
    };
    if (category === 'weapon') {
      if (!hint?.weaponClass && !byName?.weaponClass) warnings.push("Couldn't tell whether it's a simple or martial weapon; it was set to simple.");
      if (!f.damage && !/^net$/i.test(baseName(item.name))) warnings.push('No damage found.');
      else if (f.damage && !f.damageType) warnings.push(`No damage type found; it was set to ${DEFAULT_WEAPON.damageType}.`);
    }
  }
  if (isArmor) {
    const ac = f.ac ?? '';
    const type = hint?.armorType ?? byName?.armorType ?? armorTypeFromAC(ac);
    item.armor = {
      type: type ?? DEFAULT_ARMOR.type,
      ac: type === 'shield' && /^\d+$/.test(ac) ? `+${ac}` : ac,
      strength: Math.min(30, Math.max(0, f.strength ?? 0)),
      stealthDisadvantage: f.stealth ?? false,
    };
    if (category === 'armor') {
      if (!type) warnings.push(`Couldn't tell whether it's light, medium or heavy armor; it was set to ${DEFAULT_ARMOR.type}.`);
      if (!ac) warnings.push('No Armor Class found.');
    }
  }
  if (category === 'tool' || byName?.category === 'tool' || kind?.category === 'tool') {
    item.tool = { type: hint?.toolType ?? byName?.toolType ?? (ARTISAN.test(baseName(item.name)) ? 'artisan' : f.kind ? 'other' : DEFAULT_TOOL.type) };
  }

  // Magic: a rarity line, an attunement note, or a "+1" in a weapon's or armor's name.
  const bonus = nameBonus(item.name);
  if (f.rarity !== undefined || (bonus && (isWeapon || isArmor))) {
    item.magic = {
      ...DEFAULT_MAGIC,
      rarity: f.rarity || RARITY_FOR_BONUS[bonus] || DEFAULT_MAGIC.rarity,
      attunement: f.attunement !== undefined,
      attunementBy: f.attunement ?? '',
      bonus,
      effects: [],
    };
    if (f.rarity === '') warnings.push(`Its rarity varies; it was set to ${item.magic.rarity}.`);
  }

  const value = category ? withCategory(item, category) : item;
  if (!item.name) warnings.push('No name found.');
  if (!item.cost) warnings.push('No cost found.');
  if (!category) {
    return {
      value,
      warnings,
      question: {
        prompt: `What kind of item is ${item.name || 'this'}?`,
        detail,
        choices: ITEM_CATEGORIES.map((c) => ({ label: ITEM_CATEGORY_NAMES[c], apply: (v: Item) => withCategory(v, c) })),
        answeredBy: (before, after) => before.category !== after.category,
      },
    };
  }
  return { value, warnings };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ---------- splitting a pasted table into rows ----------

const COLUMN_WORDS = /\b(name|item|cost|price|weight|damage|properties|mastery|armor class|ac|strength|stealth|capacity)\b/gi;

/**
 * Splits a pasted equipment table into one text per item, so each can be read and reviewed on its
 * own. Section headings ("Martial Melee Weapons", "Light Armor") are carried onto the rows under
 * them as a "Type:" line. Text that isn't a table comes back whole.
 */
export function splitItemText(text: string): string[] {
  const lines = cleanLines(text);
  const rows: { text: string; heading: string }[] = [];
  let heading = '';
  for (const line of lines) {
    if (matchLabel(line)) return [text];
    if (splitRow(line)) {
      rows.push({ text: line, heading });
      continue;
    }
    if ((line.match(COLUMN_WORDS) ?? []).length >= 2 && line.split(' ').length <= 10) continue; // column headers
    if (kindFromLine(line)) {
      heading = line;
      continue;
    }
    const last = rows[rows.length - 1];
    // A row wrapped onto the next line, such as "two-handed" after "Ammunition (range 80/320), loading,".
    if (last && (/^[a-z(]/.test(line) || /[,(]$/.test(last.text))) {
      last.text = `${last.text} ${line}`;
      continue;
    }
    if (line.split(' ').length > 6) return [text]; // prose: one item's description
    heading = ''; // a heading this doesn't recognise, such as "Containers": no type for the rows under it
  }
  if (rows.length < 2) return [text];
  return rows.map((r) => (r.heading ? `${r.text}\nType: ${r.heading}` : r.text));
}

/**
 * Splits a table pasted for the table import: every line is one item, with no guessing whether the
 * text is a table. Column headers ("Name Cost Weight") are skipped and section headings ("Martial
 * Melee Weapons", "Light Armor") are carried onto the rows under them as a "Type:" line, as
 * {@link splitItemText} does. A row broken mid-list ("…, heavy," then "two-handed") is joined back up.
 */
export function splitItemTable(text: string): string[] {
  const rows: { text: string; heading: string }[] = [];
  let heading = '';
  for (const line of cleanLines(text)) {
    const last = rows[rows.length - 1];
    if (last && /[,(]$/.test(last.text)) {
      last.text = `${last.text} ${line}`;
      continue;
    }
    if (!splitRow(line)) {
      if ((line.match(COLUMN_WORDS) ?? []).length >= 2 && line.split(' ').length <= 10) continue;
      // A heading names a kind of item without being one: "Light Armor", but not "Shield" or "Dagger".
      if (kindFromLine(line) && !kindFromName(line) && !/\d/.test(line)) {
        heading = line;
        continue;
      }
    }
    rows.push({ text: line, heading });
  }
  return rows.map((r) => (r.heading ? `${r.text}\nType: ${r.heading}` : r.text));
}
