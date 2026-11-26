// Best-effort parsing of stat blocks and spells pasted as plain text (from a PDF, a website or a
// homebrew document) into this app's records. Understands both the 2014 and 2024 printed layouts.
// Whatever can't be placed is reported as a warning so the DM can fix it in the review step.

import {
  ABILITIES,
  CONDITIONS,
  DAMAGE_TYPES,
  MAX_SLOT_LEVEL,
  NONMAGICAL,
  SIZES,
  SPELL_SCHOOLS,
  type Ability,
  type Action,
  type ActionKind,
  type CreatureTemplate,
  type DamageType,
  type DefenseType,
  type DieType,
  type Size,
  type Spell,
} from '../models';
import { blankCreature } from './creature';
import { abilityMod, averageHP, DIE_FOR_SIZE } from './dice';
import { newId } from './ids';
import { blankSpell } from './spells';
import { xpForCR } from './xp';

export interface Parsed<T> {
  value: T;
  /** Things the parser couldn't find or place, for the DM to check. */
  warnings: string[];
  /**
   * Something the parser couldn't decide on its own, for the DM to answer before it's added (such as
   * whether an item is a weapon or a tool).
   */
  question?: ParseQuestion<T>;
}

export interface ParseQuestion<T> {
  /** "What kind of item is Rope?" */
  prompt: string;
  /** Why it had to ask. */
  detail?: string;
  choices: { label: string; apply: (value: T) => T }[];
  /** True when an edit in the form already answers it, so the question goes away. */
  answeredBy?: (before: T, after: T) => boolean;
}

// ---------- shared text clean-up ----------

/** Unifies the dashes, quotes and spaces that PDFs and websites mix in, and splits into trimmed lines. */
export function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[   \t]/g, ' ')
    .replace(/[−‒–—―]/g, (d) => (d === '—' || d === '―' ? '—' : '-'))
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[​﻿]/g, '')
    .split('\n')
    .map((l) => l.replace(/ {2,}/g, ' ').trim())
    .filter(Boolean);
}

/** Joins a continuation line: new paragraph after a full sentence, otherwise a soft-wrapped line. */
export function append(text: string, line: string): string {
  if (!text) return line;
  if (/-$/.test(text) && /^[a-z]/.test(line)) return text.slice(0, -1) + line; // hyphenated wrap
  // A sentence ended, or the line starts a list item like "1st level (4 slots):" or "At Will:".
  if (/[.!?:)"]$/.test(text) || /^[^.:]{1,40}:\s/.test(line)) return `${text}\n${line}`;
  return `${text} ${line}`;
}

const lower = (s: string) => s.trim().toLowerCase();

// ---------- creatures ----------

const SECTION_KINDS: Record<string, ActionKind | 'traits' | 'notes'> = {
  traits: 'traits',
  'special traits': 'traits',
  actions: 'action',
  'bonus actions': 'bonus',
  'bonus action': 'bonus',
  reactions: 'reaction',
  reaction: 'reaction',
  'legendary actions': 'legendary',
  'lair actions': 'notes',
  'regional effects': 'notes',
  'mythic actions': 'notes',
  'villain actions': 'notes',
};

/** Header keys, longest first so "Damage Immunities" wins over "Immunities". */
const KEYS = [
  ['damage vulnerabilities', 'vulnerabilities'],
  ['damage resistances', 'resistances'],
  ['damage immunities', 'immunities'],
  ['condition immunities', 'conditionImmunities'],
  ['vulnerabilities', 'vulnerabilities'],
  ['resistances', 'resistances'],
  ['immunities', 'immunities'],
  ['armor class', 'ac'],
  ['hit points', 'hp'],
  ['saving throws', 'saves'],
  ['proficiency bonus', 'ignore'],
  ['initiative', 'ignore'],
  ['challenge', 'cr'],
  ['languages', 'languages'],
  ['senses', 'senses'],
  ['skills', 'skills'],
  ['speed', 'speed'],
  ['gear', 'gear'],
  ['saves', 'saves'],
  ['ac', 'ac'],
  ['hp', 'hp'],
  ['cr', 'cr'],
] as const;
type Key = (typeof KEYS)[number][1];

const KEY_RE = new RegExp(`^(${KEYS.map(([k]) => k.replace(/ /g, '\\s+')).join('|')})\\b\\s*:?\\s*(.*)$`, 'i');

function matchKey(line: string): { key: Key; value: string } | null {
  const m = KEY_RE.exec(line);
  if (!m) return null;
  const label = m[1]!.toLowerCase().replace(/\s+/g, ' ');
  const key = KEYS.find(([k]) => k === label)![1];
  const value = m[2]!.trim();
  // Short keys need a number or nothing after them, so a trait like "Acid Spray. ..." isn't one.
  if ((key === 'ac' || key === 'hp' || key === 'cr') && value && !/^[\d½¼⅛]/.test(value)) return null;
  // "Speed Burst. ..." is a trait that happens to start with a key word.
  if (/^\./.test(value) || matchEntry(line)) return null;
  return { key, value };
}

const SIZE_RE = new RegExp(`^(${SIZES.join('|')})(?:\\s+or\\s+(?:${SIZES.join('|')}))?\\s+(.+)$`, 'i');

/** "Small humanoid (goblinoid), neutral evil" → size, type, alignment. */
function parseSizeLine(line: string): { size: Size; type: string; alignment: string } | null {
  const m = SIZE_RE.exec(line);
  if (!m) return null;
  const size = SIZES.find((s) => s.toLowerCase() === m[1]!.toLowerCase())!;
  const rest = m[2]!;
  // The alignment follows the last comma that isn't inside parentheses.
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '(') depth++;
    else if (rest[i] === ')') depth--;
    else if (rest[i] === ',' && depth === 0) cut = i;
  }
  const type = (cut >= 0 ? rest.slice(0, cut) : rest).trim();
  const alignment = cut >= 0 ? rest.slice(cut + 1).trim() : '';
  if (!type || type.length > 60) return null;
  return { size, type: type.toLowerCase(), alignment: alignment.toLowerCase() };
}

const ABILITY_NAMES: Record<Ability, string> = {
  str: 'str(?:ength)?',
  dex: 'dex(?:terity)?',
  con: 'con(?:stitution)?',
  int: 'int(?:elligence)?',
  wis: 'wis(?:dom)?',
  cha: 'cha(?:risma)?',
};

/** True for a line that's only part of an ability table: names, scores, modifiers, column headings. */
function isAbilityLine(line: string): boolean {
  const stripped = line
    .replace(/\b(str|dex|con|int|wis|cha|strength|dexterity|constitution|intelligence|wisdom|charisma|mod|save|score)\b/gi, '')
    .replace(/[\d()+\-\s|]/g, '');
  return stripped === '' && /\d|str|dex|con|int|wis|cha|mod|save/i.test(line);
}

interface AbilityResult {
  abilities: Partial<Record<Ability, number>>;
  /** 2024 tables print each save; the ones above the modifier are proficient. */
  saves: string[];
}

function parseAbilities(text: string): AbilityResult {
  const abilities: Partial<Record<Ability, number>> = {};
  const saves: string[] = [];
  // "STR 8 (-1)", "Str 8 -1 -1" or "STR\n8 (-1)" (newlines are already spaces here).
  for (const a of ABILITIES) {
    const m = new RegExp(`\\b${ABILITY_NAMES[a]}\\b\\s*:?\\s*(\\d{1,2})(?:\\s*\\(?\\s*([+-]\\d+)\\s*\\)?\\s*([+-]\\d+)?)?`, 'i').exec(text);
    if (!m) continue;
    abilities[a] = Number(m[1]);
    if (m[2] !== undefined && m[3] !== undefined && Number(m[3]) !== Number(m[2])) {
      const save = Number(m[3]);
      saves.push(`${a.charAt(0).toUpperCase()}${a.slice(1)} ${save >= 0 ? '+' : '-'}${Math.abs(save)}`);
    }
  }
  if (Object.keys(abilities).length === 6) return { abilities, saves };
  // "STR DEX CON INT WIS CHA" then "8 (-1) 14 (+2) ...": take the scores in order.
  if (/\bstr\b.*\bdex\b.*\bcon\b.*\bint\b.*\bwis\b.*\bcha\b/i.test(text)) {
    const after = text.slice(/\bcha\b/i.exec(text)!.index + 3);
    const scores = [...after.matchAll(/(?<![\d+-])(\d{1,2})(?:\s*\(\s*[+-]?\d+\s*\))?/g)].map((m) => Number(m[1]));
    if (scores.length >= 6) {
      ABILITIES.forEach((a, i) => (abilities[a] = scores[i]!));
      return { abilities, saves: [] };
    }
  }
  return { abilities, saves };
}

const FILLER =
  /\b(and|or|from|by|nonmagical|non-magical|magical|magic|not|aren't|that|attacks?|weapons?|damage|silvered|adamantine|made|with|of|the|is|are|in|on)\b/g;

/** Damage and condition words in a defenses line, plus whatever text couldn't be placed. */
function parseDefenses(value: string, allowNonmagical: boolean) {
  const damage: DefenseType[] = [];
  const conditions: string[] = [];
  const leftovers: string[] = [];
  for (const clause of lower(value).split(/;/)) {
    let rest = clause;
    const nonmagical = /non-?magical|not magical|aren't magical|that aren't (silvered|adamantine)/.test(clause);
    if (nonmagical && allowNonmagical) {
      damage.push(NONMAGICAL);
      rest = rest.replace(/\b(bludgeoning|piercing|slashing)\b/g, '');
    }
    for (const d of DAMAGE_TYPES) {
      const re = new RegExp(`\\b${d}\\b`, 'g');
      if (re.test(rest)) {
        damage.push(d);
        rest = rest.replace(re, '');
      }
    }
    for (const c of CONDITIONS) {
      const re = new RegExp(`\\b${c}\\b`, 'g');
      if (re.test(rest)) {
        conditions.push(c);
        rest = rest.replace(re, '');
      }
    }
    const left = rest.replace(FILLER, '').replace(/[^a-z]+/g, ' ').trim();
    if (left) leftovers.push(clause.trim());
  }
  return { damage: [...new Set(damage)], conditions: [...new Set(conditions)], leftovers };
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with']);

/**
 * "Fire Breath (Recharge 5-6). Description..." → name and description. Names are short and in
 * Title Case, so ordinary sentences that wrapped onto a new line aren't mistaken for one.
 */
function matchEntry(line: string): { name: string; description: string } | null {
  const m = /^([A-Z][A-Za-z'\-/ ]{0,48}?)((?:\s*\([^)]{1,60}\))*)\s*\.\s+(\S.*)$/.exec(line);
  if (!m) return null;
  const words = m[1]!.trim().split(/\s+/);
  if (words.length > 7) return null;
  if (!words.every((w, i) => /^[A-Z]/.test(w) || (i > 0 && SMALL_WORDS.has(w)))) return null;
  return { name: (m[1]!.trim() + m[2]!).trim(), description: m[3]!.trim() };
}

/** Pulls "(Recharge 5-6)" / "(Recharge 6)" out of a name into a threshold recharge. */
function splitRecharge(name: string): { name: string; minRoll?: number } {
  const m = /\s*\(\s*recharge\s+(\d)(?:\s*-\s*6)?\s*\)/i.exec(name);
  if (!m) return { name };
  const minRoll = Math.min(6, Math.max(2, Number(m[1])));
  return { name: (name.slice(0, m.index) + name.slice(m.index + m[0].length)).trim(), minRoll };
}

/** Turns a pasted stat block into a creature. Never throws: missing parts get defaults and a warning. */
export function parseCreatureText(text: string): Parsed<CreatureTemplate> {
  const t = blankCreature();
  const warnings: string[] = [];
  const notes: string[] = [];
  const lines = cleanLines(text);
  if (lines.length === 0) return { value: t, warnings: ['Nothing to read: the text is empty.'] };

  const found = new Set<string>();
  const abilityText: string[] = [];
  const unplaced: string[] = [];
  let i = 0;

  // Name: the first line, unless the paste starts straight into the stat block.
  if (!matchKey(lines[0]!) && !parseSizeLine(lines[0]!) && !isAbilityLine(lines[0]!)) {
    t.name = lines[0]!.replace(/\s*\(.*?\)\s*$/, (p) => (/\d/.test(p) ? '' : p)).trim();
    i = 1;
  }
  if (!t.name) warnings.push('No name found.');

  // ---- header: everything up to the first trait, action or section heading ----
  let hitDiceDie: DieType | undefined;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (SECTION_KINDS[lower(line).replace(/:$/, '')]) break;

    if (!found.has('size')) {
      const sz = parseSizeLine(line);
      if (sz) {
        Object.assign(t, sz);
        found.add('size');
        continue;
      }
    }

    const kv = matchKey(line);
    if (kv) {
      let { value } = kv;
      // A label on its own line, with its value on the next (as some websites copy).
      if (!value && i + 1 < lines.length && !matchKey(lines[i + 1]!)) value = lines[++i]!;
      found.add(kv.key);
      switch (kv.key) {
        case 'ac': {
          // "15 (leather armor, shield)" or 2024's "15 Initiative +2 (12)".
          const m = /^(\d+)\s*(?:\((.*?)\))?/.exec(value);
          if (m) {
            t.ac = Number(m[1]);
            t.acNote = m[2]?.trim() ?? '';
          }
          const rest = value.replace(/^\d+\s*(?:\(.*?\))?/, '').replace(/\binitiative\b.*$/i, '').trim();
          if (!t.acNote && rest) t.acNote = rest.replace(/^[,;]\s*/, '');
          break;
        }
        case 'hp': {
          const m = /^(\d+)\s*(?:\(\s*(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*\))?/i.exec(value);
          if (m) {
            t.maxHP = Number(m[1]);
            if (m[2]) {
              const die = `d${m[3]}` as DieType;
              t.hitDice = {
                count: Number(m[2]),
                dieType: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].includes(die) ? die : DIE_FOR_SIZE[t.size],
                bonus: m[4] ? (m[4] === '-' ? -1 : 1) * Number(m[5]) : 0,
              };
              hitDiceDie = t.hitDice.dieType;
            }
          }
          break;
        }
        case 'speed':
          t.speed = value;
          break;
        case 'saves':
          t.saves = value;
          break;
        case 'skills':
          t.skills = value;
          break;
        case 'senses':
          t.senses = value;
          break;
        case 'languages':
          t.languages = value;
          break;
        case 'gear':
          notes.push(`Gear: ${value}`);
          break;
        case 'cr': {
          // "1/4 (50 XP)", "10 (5,900 XP)" or 2024's "1/4 (XP 50; PB +2)".
          const cr = /^(\d+\/\d+|\d+|½|¼|⅛)/.exec(value.trim())?.[1];
          if (cr) t.cr = cr === '½' ? '1/2' : cr === '¼' ? '1/4' : cr === '⅛' ? '1/8' : cr;
          const xp = /([\d,]+)\s*xp|xp\s*([\d,]+)/i.exec(value);
          t.xp = xp ? Number((xp[1] ?? xp[2])!.replace(/,/g, '')) : (xpForCR(t.cr) ?? 0);
          break;
        }
        case 'vulnerabilities': {
          const d = parseDefenses(value, false);
          t.damageVulnerabilities = d.damage.filter((x): x is DamageType => x !== NONMAGICAL);
          if (d.leftovers.length) notes.push(`Damage vulnerabilities: ${value}`);
          break;
        }
        case 'resistances': {
          const d = parseDefenses(value, true);
          t.damageResistances = d.damage;
          if (d.leftovers.length) notes.push(`Damage resistances: ${value}`);
          break;
        }
        case 'immunities': {
          // 2024 stat blocks list damage and condition immunities together.
          const d = parseDefenses(value, true);
          t.damageImmunities = d.damage;
          t.conditionImmunities = [...new Set([...t.conditionImmunities, ...d.conditions])];
          if (d.leftovers.length) notes.push(`Immunities: ${value}`);
          break;
        }
        case 'conditionImmunities': {
          const d = parseDefenses(value, false);
          t.conditionImmunities = [...new Set([...t.conditionImmunities, ...d.conditions])];
          if (d.leftovers.length) notes.push(`Condition immunities: ${value}`);
          break;
        }
        case 'ignore':
          break;
      }
      continue;
    }

    if (isAbilityLine(line)) {
      abilityText.push(line);
      continue;
    }
    // A trait right after the header, with no "Traits" heading (the 2014 layout).
    if (matchEntry(line)) break;
    unplaced.push(line);
  }

  const ab = parseAbilities(abilityText.join(' '));
  for (const a of ABILITIES) if (ab.abilities[a] !== undefined) t.abilities[a] = Math.min(30, Math.max(1, ab.abilities[a]!));
  if (!t.saves && ab.saves.length) t.saves = ab.saves.join(', ');
  const missingAbilities = ABILITIES.filter((a) => ab.abilities[a] === undefined);
  if (missingAbilities.length === 6) warnings.push('No ability scores found; they were left at 10.');
  else if (missingAbilities.length) warnings.push(`No score found for ${missingAbilities.map((a) => a.toUpperCase()).join(', ')}; left at 10.`);

  if (!found.has('size')) warnings.push('No size, type and alignment line found.');
  if (!found.has('ac')) warnings.push('No Armor Class found.');
  if (!found.has('hp')) warnings.push('No Hit Points found.');
  if (!found.has('cr')) warnings.push('No Challenge Rating found.');

  // Hit dice: keep what was printed; otherwise use the size's die and a count that fits the HP.
  if (!hitDiceDie) {
    const die = DIE_FOR_SIZE[t.size];
    const perDie = (Number(die.slice(1)) + 1) / 2 + abilityMod(t.abilities.con);
    const count = Math.max(1, Math.round(t.maxHP / Math.max(1, perDie)));
    t.hitDice = { count, dieType: die, bonus: count * abilityMod(t.abilities.con) };
    if (!found.has('hp')) t.maxHP = averageHP(t.hitDice);
  }

  // ---- traits and actions ----
  let section: ActionKind | 'traits' | 'notes' = 'traits';
  let current: { description: string } | null = null;
  const legendaryIntro: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const heading = SECTION_KINDS[lower(line).replace(/:$/, '')];
    if (heading) {
      section = heading;
      current = null;
      if (heading === 'notes') notes.push(line.replace(/:$/, ''));
      continue;
    }
    if (section === 'notes') {
      notes.push(line);
      continue;
    }
    const entry = matchEntry(line);
    if (entry) {
      if (section === 'traits') {
        const trait = { id: newId(), name: entry.name, description: entry.description };
        t.traits.push(trait);
        current = trait;
      } else {
        const { name, minRoll } = splitRecharge(entry.name);
        const action: Action = { id: newId(), name, description: entry.description, kind: section };
        if (minRoll && section !== 'legendary') action.recharge = { mode: 'threshold', minRoll };
        t.actions.push(action);
        current = action;
      }
      continue;
    }
    if (current) current.description = append(current.description, line);
    else if (section === 'legendary') legendaryIntro.push(line);
    else unplaced.push(line);
  }

  if (legendaryIntro.length) notes.unshift(`Legendary actions: ${legendaryIntro.join(' ')}`);
  if (unplaced.length) {
    notes.push(...unplaced);
    warnings.push(`${unplaced.length} line${unplaced.length === 1 ? " wasn't" : "s weren't"} recognised and went into Notes.`);
  }
  if (notes.some((n) => /^(damage|condition|immunities)/i.test(n))) {
    warnings.push('Some resistances or immunities have conditions this app can\'t track; the full text is in Notes.');
  }
  t.notes = notes.join('\n');
  // Keep the action kinds in canonical order.
  const order: ActionKind[] = ['action', 'bonus', 'reaction', 'legendary'];
  t.actions = order.flatMap((k) => t.actions.filter((a) => a.kind === k));

  // A Spellcasting trait (or action) that lists slots means the creature casts with spell slots.
  const slots = parseSpellSlots([...t.traits, ...t.actions].map((x) => x.description).join('\n'));
  if (slots) {
    t.spellResource = 'slots';
    t.spellSlots = slots;
  }
  return { value: t, warnings };
}

const SLOT_LEVEL_RE = /\b([1-9])(?:st|nd|rd|th)?[- ]level\s*\(\s*(\d+)\s*slots?\s*\)/gi;
// A warlock's pact slots: "1st-5th level (2 5th-level slots)".
const PACT_SLOT_RE = /\(\s*(\d+)\s+([1-9])(?:st|nd|rd|th)?[- ]level\s+slots?\s*\)/gi;

/**
 * Spell slots by level from spellcasting text, as printed in 2014 stat blocks: "1st level (4 slots):"
 * or a warlock's "1st-5th level (2 5th-level slots):". Index 0 is 1st level. Undefined when none are listed.
 */
export function parseSpellSlots(text: string): number[] | undefined {
  const slots = Array.from({ length: MAX_SLOT_LEVEL }, () => 0);
  let found = false;
  for (const [, level, count] of text.matchAll(SLOT_LEVEL_RE)) {
    slots[Number(level) - 1] = Math.min(99, Number(count));
    found = true;
  }
  for (const [, count, level] of text.matchAll(PACT_SLOT_RE)) {
    slots[Number(level) - 1] = Math.min(99, Number(count));
    found = true;
  }
  return found && slots.some((n) => n > 0) ? slots : undefined;
}

// ---------- spells ----------

const ORDINAL_LEVEL = /^(\d)(?:st|nd|rd|th)?[- ]level\s+([a-z]+)/i;

/** The line under the name: "3rd-level evocation (ritual)", "Evocation cantrip", "Level 3 Evocation (Wizard)". */
function parseSpellSubtitle(line: string): { level: number; school: string; ritual: boolean } | null {
  const ritual = /\britual\b/i.test(line);
  let m = ORDINAL_LEVEL.exec(line);
  if (m) return { level: Number(m[1]), school: m[2]!.toLowerCase(), ritual };
  m = /^level\s+(\d)\s+([a-z]+)/i.exec(line);
  if (m) return { level: Number(m[1]), school: m[2]!.toLowerCase(), ritual };
  m = /^([a-z]+)\s+cantrip\b/i.exec(line);
  if (m) return { level: 0, school: m[1]!.toLowerCase(), ritual };
  m = /^cantrip\s+\(?([a-z]+)/i.exec(line);
  if (m && (SPELL_SCHOOLS as readonly string[]).includes(m[1]!.toLowerCase())) return { level: 0, school: m[1]!.toLowerCase(), ritual };
  return null;
}

const SPELL_KEYS = [
  ['casting time', 'castingTime'],
  ['range/area', 'range'],
  ['range', 'range'],
  ['components', 'components'],
  ['component', 'components'],
  ['duration', 'duration'],
  ['level', 'level'],
  ['school', 'school'],
  ['classes', 'ignore'],
  ['class', 'ignore'],
  ['attack/save', 'ignore'],
  ['damage/effect', 'ignore'],
  ['source', 'ignore'],
  ['tags', 'ignore'],
] as const;
type SpellKey = (typeof SPELL_KEYS)[number][1];
const SPELL_KEY_RE = new RegExp(
  `^(${SPELL_KEYS.map(([k]) => k.replace(/ /g, '\\s+').replace(/\//g, '\\/')).join('|')})\\b\\s*:?\\s*(.*)$`,
  'i',
);

function matchSpellKey(line: string): { key: SpellKey; value: string } | null {
  const m = SPELL_KEY_RE.exec(line);
  if (!m) return null;
  const label = m[1]!.toLowerCase().replace(/\s+/g, ' ');
  // "Level 3 Evocation" is the subtitle line, not a key.
  if (label === 'level' && parseSpellSubtitle(line)) return null;
  return { key: SPELL_KEYS.find(([k]) => k === label)![1], value: m[2]!.trim() };
}

const HIGHER_RE = /^(at higher levels|using a higher-level spell slot|cantrip upgrade|higher levels)\s*[.:]\s*/i;

/** Turns a pasted spell description into a spell. Never throws: missing parts get defaults and a warning. */
export function parseSpellText(text: string): Parsed<Spell> {
  const s = blankSpell();
  s.components = '';
  s.duration = '';
  s.castingTime = '';
  const warnings: string[] = [];
  const lines = cleanLines(text);
  if (lines.length === 0) return { value: s, warnings: ['Nothing to read: the text is empty.'] };

  let i = 0;
  if (!matchSpellKey(lines[0]!) && !parseSpellSubtitle(lines[0]!)) {
    s.name = lines[0]!;
    i = 1;
  }
  if (!s.name) warnings.push('No name found.');

  const found = new Set<string>();
  const body: string[] = [];
  let higher = '';
  let inHigher = false;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (!found.has('subtitle') && body.length === 0) {
      const sub = parseSpellSubtitle(line);
      if (sub) {
        s.level = sub.level;
        s.school = sub.school;
        s.ritual ||= sub.ritual;
        found.add('subtitle');
        continue;
      }
    }
    // Keys come before the description; afterwards, lines starting with "Range" are prose.
    const kv = body.length === 0 ? matchSpellKey(line) : null;
    if (kv) {
      let { value } = kv;
      if (!value && i + 1 < lines.length && !matchSpellKey(lines[i + 1]!)) value = lines[++i]!;
      found.add(kv.key);
      switch (kv.key) {
        case 'castingTime':
          s.castingTime = value.replace(/\s*\bor ritual\b/i, '').trim();
          if (/\britual\b/i.test(value)) s.ritual = true;
          break;
        case 'range':
          s.range = value;
          break;
        case 'components':
          s.components = value.replace(/\s*\*\s*-\s*/, ' ').replace(/\s*\*$/, '');
          break;
        case 'duration':
          s.duration = value;
          break;
        case 'level': {
          if (/cantrip/i.test(value)) s.level = 0;
          else {
            const n = /\d/.exec(value);
            if (n) s.level = Number(n[0]);
          }
          found.add('subtitle');
          break;
        }
        case 'school':
          s.school = value.toLowerCase().replace(/\s*\(ritual\)/, '');
          if (/ritual/i.test(value)) s.ritual = true;
          break;
        case 'ignore':
          break;
      }
      continue;
    }
    const hm = HIGHER_RE.exec(line);
    if (hm) {
      inHigher = true;
      higher = append(higher, line.slice(hm[0].length));
      continue;
    }
    if (inHigher) higher = append(higher, line);
    else body.push(line);
  }

  s.description = body.reduce(append, '').replace(/\n/g, '\n\n');
  s.higherLevels = higher.replace(/\n/g, '\n\n');
  s.concentration = /concentration/i.test(s.duration);

  if (!found.has('subtitle')) warnings.push('No level and school found; set to 1st-level evocation.');
  if (!s.castingTime) {
    s.castingTime = '1 action';
    warnings.push('No casting time found; set to 1 action.');
  }
  if (!s.range) warnings.push('No range found.');
  if (!s.components) warnings.push('No components found.');
  if (!s.duration) {
    s.duration = 'Instantaneous';
    warnings.push('No duration found; set to Instantaneous.');
  }
  if (!s.description) warnings.push('No description found.');
  return { value: s, warnings };
}
