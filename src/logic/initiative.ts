import type { Combat, Combatant } from '../models';
import { defaultRng, rollDie, type Rng } from './dice';

export function rollInitiative(c: Combatant, rng: Rng = defaultRng): number {
  return rollDie(20, rng) + c.initiativeBonus;
}

/**
 * DEX tie-breaker. Players have no DEX score on file, so approximate one from their initiative
 * bonus (bonus +2 → DEX 14). Keeps the ordering total so sorting stays consistent.
 */
function tieKey(c: Combatant): number {
  return c.dexScore ?? 10 + 2 * c.initiativeBonus;
}

/**
 * Sorts high to low by initiative, then DEX. Remaining ties keep their current relative order,
 * which is how a manual drag is preserved. Combatants without initiative go last.
 */
export function sortInitiative(combatants: readonly Combatant[]): Combatant[] {
  return combatants
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ai = a.c.initiative;
      const bi = b.c.initiative;
      if (ai === null || bi === null) {
        if (ai === bi) return a.i - b.i;
        return ai === null ? 1 : -1;
      }
      return bi - ai || tieKey(b.c) - tieKey(a.c) || a.i - b.i;
    })
    .map(({ c }) => c);
}

/** Replaces the combatant list while keeping the turn pointer on the same combatant. */
export function withCombatants(combat: Combat, combatants: Combatant[]): Combat {
  const currentId = combat.combatants[combat.turnIndex]?.id;
  let turnIndex = currentId ? combatants.findIndex((c) => c.id === currentId) : -1;
  if (turnIndex < 0) turnIndex = Math.min(combat.turnIndex, Math.max(0, combatants.length - 1));
  return { ...combat, combatants, turnIndex };
}

/** Re-sorts the whole combat by initiative, keeping the current-turn pointer on the same combatant. */
export function resortCombat(combat: Combat): Combat {
  return withCombatants(combat, sortInitiative(combat.combatants));
}

/** Manual reorder (drag) for delayed or readied actions. Keeps the pointer on the same combatant. */
export function moveCombatant(combat: Combat, from: number, to: number): Combat {
  const list = [...combat.combatants];
  if (from < 0 || from >= list.length) return combat;
  const [moved] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(to, list.length)), 0, moved!);
  return withCombatants(combat, list);
}
