import {
  CONDITIONS,
  type ActiveCondition,
  type Combat,
  type Combatant,
  type Condition,
  type ConditionTiming,
  type ID,
  type LogEntry,
} from '../models';
import { newId } from './ids';

/*
 * Condition durations are counted on one combatant's turns (the "anchor"): the affected creature by
 * default, or e.g. the caster for "until the end of your next turn".
 *  - ends 'end'   → drops by 1 at the end of each of the anchor's turns; removed at 0.
 *                   Applied during the anchor's own turn, that turn doesn't count (it arms instead).
 *  - ends 'start' → drops by 1 at the start of each of the anchor's turns; removed at 0.
 * So "1 round, end" applied on someone else's turn ends at the end of the anchor's next turn, and
 * "1 round, start" ends at the start of the anchor's next turn.
 */

export interface ConditionDuration {
  /** null = until removed */
  rounds: number | null;
  ends: ConditionTiming;
  /** null = the affected combatant */
  anchorId: ID | null;
}

const byStandardOrder = (a: ActiveCondition, b: ActiveCondition) =>
  CONDITIONS.indexOf(a.name) - CONDITIONS.indexOf(b.name);

function mapCombatant(combat: Combat, id: ID, fn: (c: Combatant) => Combatant): Combat {
  let changed = false;
  const combatants = combat.combatants.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return fn(c);
  });
  return changed ? { ...combat, combatants } : combat;
}

/** Whose turns a condition counts on: its anchor if still in the combat, else the affected combatant. */
export function conditionAnchor(combat: Combat, affected: Combatant, cond: ActiveCondition): ID {
  return cond.anchorId && combat.combatants.some((c) => c.id === cond.anchorId) ? cond.anchorId : affected.id;
}

/** An end-timed duration set during its anchor's own turn waits for that turn to finish before counting. */
function startsArmed(combat: Combat, anchorId: ID, ends: ConditionTiming): boolean {
  const current = combat.combatants[combat.turnIndex];
  return !(combat.status === 'active' && ends === 'end' && current?.id === anchorId);
}

function build(combat: Combat, affectedId: ID, name: Condition, d: ConditionDuration | null): ActiveCondition {
  if (!d || d.rounds === null) return { name };
  const rounds = Math.max(1, Math.floor(d.rounds));
  const anchor = d.anchorId && d.anchorId !== affectedId ? d.anchorId : null;
  const cond: ActiveCondition = { name, rounds, ends: d.ends, armed: startsArmed(combat, anchor ?? affectedId, d.ends) };
  if (anchor) cond.anchorId = anchor;
  return cond;
}

/** Adds a condition, or replaces its duration if already present. */
export function setCondition(combat: Combat, id: ID, name: Condition, duration: ConditionDuration | null = null): Combat {
  return mapCombatant(combat, id, (c) => {
    const others = c.conditions.filter((x) => x.name !== name);
    return { ...c, conditions: [...others, build(combat, id, name, duration)].sort(byStandardOrder) };
  });
}

export function removeCondition(combat: Combat, id: ID, name: Condition): Combat {
  return mapCombatant(combat, id, (c) =>
    c.conditions.some((x) => x.name === name) ? { ...c, conditions: c.conditions.filter((x) => x.name !== name) } : c,
  );
}

/** Quick toggle from the chips: adds an untimed condition or removes it. */
export function toggleCondition(combat: Combat, id: ID, name: Condition): Combat {
  const c = combat.combatants.find((x) => x.id === id);
  if (!c) return combat;
  return c.conditions.some((x) => x.name === name) ? removeCondition(combat, id, name) : setCondition(combat, id, name);
}

export function clearConditions(combat: Combat, id: ID): Combat {
  return mapCombatant(combat, id, (c) => (c.conditions.length ? { ...c, conditions: [] } : c));
}

export function hasCondition(c: Combatant, name: Condition): boolean {
  return c.conditions.some((x) => x.name === name);
}

/**
 * Ticks every timed condition anchored to `anchorId` for this phase of its turn, removing and
 * logging the ones that run out.
 */
export function tickConditions(combat: Combat, anchorId: ID, phase: ConditionTiming): Combat {
  const ended: LogEntry[] = [];
  let changed = false;
  const combatants = combat.combatants.map((c) => {
    if (!c.conditions.some((x) => x.rounds !== undefined)) return c;
    const conditions: ActiveCondition[] = [];
    for (const cond of c.conditions) {
      const timed = cond.rounds !== undefined && (cond.ends ?? 'end') === phase;
      const anchor = conditionAnchor(combat, c, cond);
      if (!timed || anchor !== anchorId) {
        conditions.push(cond);
        continue;
      }
      changed = true;
      // "Skip the turn it was applied on" belongs to the original anchor; after a fallback it doesn't apply.
      const fellBack = (cond.anchorId ?? c.id) !== anchor;
      if (phase === 'end' && cond.armed === false && !fellBack) {
        conditions.push({ ...cond, armed: true });
        continue;
      }
      const rounds = cond.rounds! - 1;
      if (rounds > 0) conditions.push({ ...cond, rounds });
      else {
        ended.push({
          id: newId(),
          type: 'conditionEnded',
          round: combat.round,
          combatantId: c.id,
          condition: cond.name,
          at: Date.now(),
        });
      }
    }
    return conditions.length === c.conditions.length && conditions.every((x, i) => x === c.conditions[i])
      ? c
      : { ...c, conditions };
  });
  if (!changed) return combat;
  return { ...combat, combatants, log: ended.length ? [...combat.log, ...ended] : combat.log };
}

/** Short label for a badge or list: "prone", "prone · 2". */
export function conditionLabel(cond: ActiveCondition): string {
  return cond.rounds === undefined ? cond.name : `${cond.name} · ${cond.rounds}`;
}

/** Spelled out: "2 rounds, ends at the end of Aria's turn". */
export function describeDuration(cond: ActiveCondition, anchorName: string): string {
  if (cond.rounds === undefined) return 'until removed';
  const n = cond.rounds;
  return `${n} round${n === 1 ? '' : 's'}, ends at the ${cond.ends ?? 'end'} of ${anchorName}'s turn`;
}

/** Older saves stored conditions as plain names. */
export function normalizeConditions(list: unknown): ActiveCondition[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((x): ActiveCondition | null => {
      if (typeof x === 'string') return CONDITIONS.includes(x as Condition) ? { name: x as Condition } : null;
      if (x && typeof x === 'object' && CONDITIONS.includes((x as ActiveCondition).name)) return x as ActiveCondition;
      return null;
    })
    .filter((x): x is ActiveCondition => x !== null);
}
