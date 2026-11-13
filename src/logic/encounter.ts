import type { CreatureTemplate, Encounter, ID } from '../models';
import { newId } from './ids';
import { encounterDifficulty, type DifficultyResult } from './xp';

export const MAX_COUNT = 99;

export function blankEncounter(): Encounter {
  const now = Date.now();
  return { id: newId(), name: '', description: '', entries: [], tags: [], createdAt: now, updatedAt: now };
}

/** Sets how many of a creature are in the encounter. 0 removes it; new creatures go to the end. */
export function setEntryCount(enc: Encounter, templateId: ID, count: number): Encounter {
  const n = Math.min(MAX_COUNT, Math.max(0, Math.floor(count)));
  const exists = enc.entries.some((e) => e.templateId === templateId);
  let entries = exists
    ? enc.entries.map((e) => (e.templateId === templateId ? { ...e, count: n } : e))
    : [...enc.entries, { templateId, count: n }];
  entries = entries.filter((e) => e.count > 0);
  return { ...enc, entries };
}

export function addToEncounter(enc: Encounter, templateId: ID, by = 1): Encounter {
  const current = enc.entries.find((e) => e.templateId === templateId)?.count ?? 0;
  return setEntryCount(enc, templateId, current + by);
}

export interface EncounterStats extends DifficultyResult {
  monsterCount: number;
  /** Entries whose stat block no longer exists. They're ignored in the totals. */
  missing: ID[];
}

/** Live totals: base XP, adjusted XP with the monster-count multiplier, and difficulty against party levels. */
export function encounterStats(
  enc: Pick<Encounter, 'entries'>,
  templates: ReadonlyMap<ID, Pick<CreatureTemplate, 'xp'>>,
  partyLevels: readonly number[],
): EncounterStats {
  const xps: number[] = [];
  const missing: ID[] = [];
  for (const e of enc.entries) {
    const t = templates.get(e.templateId);
    if (!t) {
      missing.push(e.templateId);
      continue;
    }
    for (let i = 0; i < e.count; i++) xps.push(t.xp);
  }
  return { ...encounterDifficulty(xps, [...partyLevels]), monsterCount: xps.length, missing };
}

/** "3× Goblin, Owlbear". Missing stat blocks are left out. */
export function encounterSummary(enc: Pick<Encounter, 'entries'>, templates: ReadonlyMap<ID, Pick<CreatureTemplate, 'name'>>): string {
  return enc.entries
    .map((e) => {
      const t = templates.get(e.templateId);
      if (!t) return null;
      return e.count === 1 ? t.name : `${e.count}× ${t.name}`;
    })
    .filter(Boolean)
    .join(', ');
}

export function duplicateEncounter(enc: Encounter, existingNames: readonly string[]): Encounter {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  let name = `${enc.name} (copy)`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${enc.name} (copy ${i})`;
  const now = Date.now();
  return {
    ...enc,
    id: newId(),
    name,
    entries: enc.entries.map((e) => ({ ...e })),
    tags: [...enc.tags],
    createdAt: now,
    updatedAt: now,
  };
}

/** "Session 3, ambush,  session 3" → ["Session 3", "ambush"]. The first spelling of a tag wins. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export const UNTAGGED = '';

export interface EncounterGroup {
  /** '' for encounters without tags. */
  tag: string;
  encounters: Encounter[];
}

/**
 * Groups encounters by tag (session or adventure). An encounter with several tags appears in each
 * group. Tags sort naturally ("Session 2" before "Session 10"); untagged comes last.
 */
export function groupByTag(encounters: readonly Encounter[]): EncounterGroup[] {
  const groups = new Map<string, { tag: string; encounters: Encounter[] }>();
  for (const e of encounters) {
    const tags = e.tags.length ? e.tags : [UNTAGGED];
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!groups.has(key)) groups.set(key, { tag, encounters: [] });
      groups.get(key)!.encounters.push(e);
    }
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...groups.values()]
    .map((g) => ({ ...g, encounters: [...g.encounters].sort((a, b) => collator.compare(a.name, b.name)) }))
    .sort((a, b) => {
      if (a.tag === UNTAGGED) return 1;
      if (b.tag === UNTAGGED) return -1;
      return collator.compare(a.tag, b.tag);
    });
}

/** Every distinct tag, first spelling wins, naturally sorted. */
export function allTags(encounters: readonly Encounter[]): string[] {
  return groupByTag(encounters)
    .map((g) => g.tag)
    .filter((t) => t !== UNTAGGED);
}

export function filterEncounters(
  list: readonly Encounter[],
  { query = '', tag = '' }: { query?: string; tag?: string },
): Encounter[] {
  const q = query.trim().toLowerCase();
  const t = tag.trim().toLowerCase();
  return list.filter(
    (e) =>
      (!q || e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)) &&
      (!t || e.tags.some((x) => x.toLowerCase() === t)),
  );
}
