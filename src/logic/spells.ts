import {
  MAX_SLOT_LEVEL,
  REST_TYPES,
  type CreatureTemplate,
  type ID,
  type RestType,
  type Spell,
  type SpellResource,
  type SpellUsage,
} from '../models';
import { newId } from './ids';

export function blankSpell(): Spell {
  const now = Date.now();
  return {
    id: newId(),
    name: '',
    level: 1,
    school: 'evocation',
    castingTime: '1 action',
    range: '',
    components: 'V, S',
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    description: '',
    higherLevels: '',
    createdAt: now,
    updatedAt: now,
  };
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export function spellLevelLabel(level: number): string {
  return level === 0 ? 'Cantrip' : `${ORDINALS[level] ?? `${level}th`} level`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "3rd-level evocation (ritual)" or "Evocation cantrip", as printed under a spell's name. */
export function spellSubtitle(s: Spell): string {
  const school = s.school.trim().toLowerCase();
  const base =
    s.level === 0 ? `${capitalize(school || 'unknown')} cantrip` : `${ORDINALS[s.level] ?? `${s.level}th`}-level ${school}`.trim();
  return s.ritual ? `${base} (ritual)` : base;
}

export function validateSpell(s: Spell): string[] {
  const errors: string[] = [];
  if (!s.name.trim()) errors.push('Name is required.');
  if (!Number.isInteger(s.level) || s.level < 0 || s.level > 9) errors.push('Level must be between 0 (cantrip) and 9.');
  return errors;
}

// ---------- search & filter ----------

export interface SpellFilter {
  query?: string;
  /** '' = any level. */
  level?: string;
  school?: string;
  /** Defaults to 'level' (level, then name), the order spell lists are usually printed in. */
  sort?: SpellSort;
}

export const SPELL_SORTS = ['name', 'level', 'school', 'castingTime'] as const;
export type SpellSort = (typeof SPELL_SORTS)[number];

/** Rough length of one unit of casting time, in seconds, so faster spells sort first. */
const CASTING_UNITS: [RegExp, number][] = [
  [/^reactions?\b/, 0.1],
  [/^bonus\s+actions?\b/, 0.5],
  [/^actions?\b/, 1],
  [/^rounds?\b/, 6],
  [/^min(ute)?s?\b/, 60],
  [/^h(ou)?rs?\b/, 3600],
  [/^days?\b/, 86400],
];

/**
 * A sortable number for a casting time like "1 bonus action", "10 minutes" or "1 reaction, which
 * you take when…". Reactions come first, then bonus actions, actions, minutes and hours. Anything
 * unrecognised (blank, "special") sorts last.
 */
export function castingTimeRank(castingTime: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)?\s*(.*)$/s.exec(castingTime.toLowerCase())!;
  const count = m[1] ? Number(m[1]) : 1;
  const rest = (m[2] ?? '').trim();
  for (const [re, seconds] of CASTING_UNITS) if (re.test(rest)) return count * seconds;
  return Infinity;
}

export function filterSpells(list: readonly Spell[], f: SpellFilter = {}): Spell[] {
  const q = f.query?.trim().toLowerCase() ?? '';
  const school = f.school?.trim().toLowerCase() ?? '';
  const level = f.level ? Number(f.level) : null;
  return list
    .filter(
      (s) =>
        (!q || s.name.toLowerCase().includes(q)) &&
        (level === null || s.level === level) &&
        (!school || s.school.trim().toLowerCase() === school),
    )
    .sort(spellComparator(f.sort));
}

function spellComparator(sort: SpellSort = 'level'): (a: Spell, b: Spell) => number {
  const byName = (a: Spell, b: Spell) => a.name.localeCompare(b.name);
  const byLevel = (a: Spell, b: Spell) => a.level - b.level;
  const schoolOf = (s: Spell) => s.school.trim().toLowerCase();
  switch (sort) {
    case 'name':
      return byName;
    case 'school':
      // Spells with no school go last rather than first.
      return (a, b) =>
        Number(!schoolOf(a)) - Number(!schoolOf(b)) || schoolOf(a).localeCompare(schoolOf(b)) || byLevel(a, b) || byName(a, b);
    case 'castingTime': {
      return (a, b) => {
        const ra = castingTimeRank(a.castingTime);
        const rb = castingTimeRank(b.castingTime);
        return (ra === rb ? 0 : ra < rb ? -1 : 1) || byLevel(a, b) || byName(a, b);
      };
    }
    default:
      return (a, b) => byLevel(a, b) || byName(a, b);
  }
}

export function spellSchools(list: readonly Spell[]): string[] {
  return [...new Set(list.map((s) => s.school.trim().toLowerCase()).filter(Boolean))].sort();
}

// ---------- linking to stat blocks ----------

/** The spells a stat block links to, in spell-list order (level, then name). Missing ids are skipped. */
export function linkedSpells(t: Pick<CreatureTemplate, 'spellIds'>, all: readonly Spell[]): Spell[] {
  const ids = new Set(t.spellIds ?? []);
  return filterSpells(all.filter((s) => ids.has(s.id)));
}

// ---------- limited uses ----------

export const DEFAULT_SPELL_USAGE: SpellUsage = { uses: 1, per: 'long' };

export const REST_LABELS: Record<RestType, string> = { short: 'Short rest', long: 'Long rest' };

/** "3/long rest". */
export function spellUsageLabel(u: SpellUsage): string {
  return `${u.uses}/${REST_LABELS[u.per].toLowerCase()}`;
}

/** The limit on a linked spell, or undefined when it's at will (or no longer linked). */
export function spellUsageOf(t: Pick<CreatureTemplate, 'spellIds' | 'spellUsage'>, spellId: ID): SpellUsage | undefined {
  return t.spellIds?.includes(spellId) ? t.spellUsage?.[spellId] : undefined;
}

/** Sets or clears (null) the limit on a linked spell. The map is dropped when it empties. */
export function setSpellUsage(t: CreatureTemplate, spellId: ID, usage: SpellUsage | null): CreatureTemplate {
  const { [spellId]: _old, ...rest } = t.spellUsage ?? {};
  const next = usage ? { ...rest, [spellId]: { uses: Math.max(1, Math.floor(usage.uses)), per: usage.per } } : rest;
  const { spellUsage: _drop, ...base } = t;
  return Object.keys(next).length ? { ...base, spellUsage: next } : base;
}

/** Changes which spells are linked, dropping the limits of any that were unlinked. */
export function setLinkedSpells(t: CreatureTemplate, spellIds: ID[]): CreatureTemplate {
  const keep = new Set(spellIds);
  const usage = Object.fromEntries(Object.entries(t.spellUsage ?? {}).filter(([id]) => keep.has(id)));
  const { spellUsage: _drop, ...base } = t;
  return Object.keys(usage).length ? { ...base, spellIds, spellUsage: usage } : { ...base, spellIds };
}

/** Linked spells with a limit, in spell-list order. */
export function limitedSpells(
  t: Pick<CreatureTemplate, 'spellIds' | 'spellUsage'>,
  all: readonly Spell[],
): Array<{ spell: Spell; usage: SpellUsage }> {
  return linkedSpells(t, all).flatMap((spell) => {
    const usage = spellUsageOf(t, spell.id);
    return usage ? [{ spell, usage }] : [];
  });
}

/** Cleans imported limits: only linked spells, at least 1 use, a known rest type. */
export function normalizeSpellUsage(v: unknown, spellIds: readonly ID[]): Record<ID, SpellUsage> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<ID, SpellUsage> = {};
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!spellIds.includes(id) || !raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const uses = typeof o.uses === 'number' && Number.isFinite(o.uses) ? Math.max(1, Math.floor(o.uses)) : 1;
    const per = REST_TYPES.includes(o.per as RestType) ? (o.per as RestType) : 'long';
    out[id] = { uses, per };
  }
  return Object.keys(out).length ? out : undefined;
}

// ---------- spell slots ----------

export const SPELL_RESOURCE_LABELS: Record<SpellResource, string> = {
  perSpell: 'Uses per spell',
  slots: 'Spell slots',
};

/** "3rd-level". */
export function slotLevelLabel(level: number): string {
  return `${ORDINALS[level] ?? `${level}th`}-level`;
}

export function spellResourceOf(t: Pick<CreatureTemplate, 'spellResource'>): SpellResource {
  return t.spellResource ?? 'perSpell';
}

/** Switches between per-spell limits and spell slots. Both settings are kept, so switching back loses nothing. */
export function setSpellResource(t: CreatureTemplate, resource: SpellResource): CreatureTemplate {
  const { spellResource: _old, ...base } = t;
  return resource === 'slots' ? { ...base, spellResource: 'slots' } : base;
}

const clampSlots = (n: number) => Math.min(99, Math.max(0, Math.floor(n)));

/** Slots per level, always 9 long (index 0 = 1st level). */
export function spellSlotsOf(t: Pick<CreatureTemplate, 'spellSlots'>): number[] {
  return Array.from({ length: MAX_SLOT_LEVEL }, (_, i) => t.spellSlots?.[i] ?? 0);
}

/** Sets the slot count for one level (1–9). The list is dropped when every level is 0. */
export function setSpellSlots(t: CreatureTemplate, level: number, count: number): CreatureTemplate {
  if (level < 1 || level > MAX_SLOT_LEVEL) return t;
  const slots = spellSlotsOf(t);
  slots[level - 1] = clampSlots(count);
  const { spellSlots: _old, ...base } = t;
  return slots.some((n) => n > 0) ? { ...base, spellSlots: slots } : base;
}

/** Levels with at least one slot, when the creature uses slots. Empty otherwise. */
export function slotLevels(
  t: Pick<CreatureTemplate, 'spellResource' | 'spellSlots'>,
): Array<{ level: number; slots: number }> {
  if (spellResourceOf(t) !== 'slots') return [];
  return spellSlotsOf(t).flatMap((slots, i) => (slots > 0 ? [{ level: i + 1, slots }] : []));
}

/** Cleans imported slot counts: whole numbers 0–99, at most 9 levels. Undefined when there are none. */
export function normalizeSpellSlots(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const slots = Array.from({ length: MAX_SLOT_LEVEL }, (_, i) => {
    const n: unknown = v[i];
    return typeof n === 'number' && Number.isFinite(n) ? clampSlots(n) : 0;
  });
  return slots.some((n) => n > 0) ? slots : undefined;
}

export type SpellTextPart = string | { text: string; spell: Spell };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits text into plain runs and mentions of the given spells (whole words, any case), so a stat
 * block can turn "3rd level (3 slots): fireball, counterspell" into hoverable spell names.
 */
export function splitSpellMentions(text: string, spells: readonly Spell[]): SpellTextPart[] {
  const named = spells.filter((s) => s.name.trim());
  if (!text || named.length === 0) return text ? [text] : [];
  const byName = new Map(named.map((s) => [s.name.trim().toLowerCase(), s]));
  // Longest first, so "Greater Invisibility" wins over "Invisibility".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const parts: SpellTextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ text: m[0], spell: byName.get(m[0].toLowerCase())! });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Every bit of a stat block's text that can mention spells. */
function creatureText(t: CreatureTemplate): string[] {
  return [...t.traits, ...t.actions].flatMap((x) => [x.name, x.description]);
}

/** Linked spells that its traits and actions never mention by name, so the stat block lists them separately. */
export function unmentionedSpells(t: CreatureTemplate, spells: readonly Spell[]): Spell[] {
  const text = creatureText(t);
  return spells.filter((s) => !text.some((x) => splitSpellMentions(x, [s]).some((p) => typeof p !== 'string')));
}

/** Spells in the list that the stat block's text mentions but that aren't linked yet. */
export function suggestedSpells(t: CreatureTemplate, all: readonly Spell[]): Spell[] {
  const linked = new Set(t.spellIds ?? []);
  const text = creatureText(t);
  const found = new Set<ID>();
  for (const x of text) {
    for (const p of splitSpellMentions(x, all)) if (typeof p !== 'string') found.add(p.spell.id);
  }
  return filterSpells(all.filter((s) => found.has(s.id) && !linked.has(s.id)));
}

// ---------- import normalisation ----------

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** Strings, string arrays (paragraphs) and numbers all become text. */
const text = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number'
      ? String(v)
      : Array.isArray(v)
        ? v.filter((x) => typeof x === 'string').join('\n\n')
        : '';
const yes = (v: unknown): boolean => v === true || (typeof v === 'string' && /^(yes|true)$/i.test(v.trim()));
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

function parseLevel(o: Record<string, unknown>): number {
  const n = num(o.level) ?? num(o.level_int);
  if (n !== undefined) return Math.min(9, Math.max(0, Math.floor(n)));
  const s = text(o.level).toLowerCase();
  if (s.includes('cantrip')) return 0;
  const m = s.match(/\d/);
  return m ? Number(m[0]) : 1;
}

/**
 * Turns an imported spell into a valid Spell. Understands this app's own format plus the common
 * shapes of public 5e spell data (school as an object, components as a list, "desc" paragraphs,
 * "yes"/"no" flags). Returns null when it has no name.
 */
export function normalizeSpell(raw: unknown): Spell | null {
  const o = obj(raw);
  const name = text(o.name).trim();
  if (!name) return null;
  const base = blankSpell();
  const school = typeof o.school === 'object' ? text(obj(o.school).name) : text(o.school);
  let components = Array.isArray(o.components) ? o.components.filter((x) => typeof x === 'string').join(', ') : text(o.components);
  const material = text(o.material).trim();
  if (material && !components.includes('(')) components = `${components} (${material.replace(/\.$/, '')})`;
  return {
    id: text(o.id) || base.id,
    name,
    level: parseLevel(o),
    school: school.trim().toLowerCase() || base.school,
    castingTime: text(o.castingTime ?? o.casting_time).trim() || base.castingTime,
    range: text(o.range).trim(),
    components: components.trim(),
    duration: text(o.duration).trim() || base.duration,
    concentration: yes(o.concentration) || /concentration/i.test(text(o.duration)),
    ritual: yes(o.ritual),
    description: text(o.description ?? o.desc).trim(),
    higherLevels: text(o.higherLevels ?? o.higher_level).trim(),
    createdAt: num(o.createdAt) ?? base.createdAt,
    updatedAt: num(o.updatedAt) ?? base.updatedAt,
  };
}

