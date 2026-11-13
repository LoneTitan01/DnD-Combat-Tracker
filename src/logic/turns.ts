import type { AbilityState, Combat, Combatant, LogEntry } from '../models';
import { tickConditions } from './conditions';
import { newId } from './ids';
import { sortInitiative } from './initiative';

/*
 * Turn lifecycle: endTurn(current) → advance pointer → startTurn(new current).
 *
 * Recharge countdown rules (only the monster's own turns count):
 *  - Fixed N: on use the ability enters `counting` un-armed. It arms at the start of the monster's
 *    next turn, then drops by 1 at the end of each of its turns. When it starts a turn at 0, it's ready.
 *    Fixed 2 used in round 1 → armed R2, 2→1 end R2, 1→0 end R3, ready start R4.
 *  - Rolled: on use → `rollNeeded`. At the start of each of the monster's turns a prompt is pending.
 *    Entering the roll sets an armed countdown, so the entry turn counts. Rolled 2 in R2 → ready R4.
 *  - Threshold (Recharge X–6): on use → `thresholdRoll`. A prompt is pending at the start of each of
 *    the monster's turns; a roll ≥ X makes it ready immediately.
 *  - A dismissed prompt clears until the next turn start; dead creatures are skipped so never tick.
 */

export function isActiveCombatant(c: Combatant): boolean {
  return !c.isDead;
}

export function currentCombatant(combat: Combat): Combatant | undefined {
  return combat.combatants[combat.turnIndex];
}

function mapCurrent(combat: Combat, fn: (c: Combatant) => Combatant): Combat {
  const cur = currentCombatant(combat);
  if (!cur) return combat;
  const combatants = [...combat.combatants];
  combatants[combat.turnIndex] = fn(cur);
  return { ...combat, combatants };
}

/**
 * Called when a combatant's turn begins: start-timed condition durations anchored to it tick, then its
 * recharge countdowns arm/finish and roll prompts are raised.
 */
export function startTurn(combat: Combat): Combat {
  const first = currentCombatant(combat);
  if (!first || first.isDead) return combat;
  combat = tickConditions(combat, first.id, 'start');
  const cur = currentCombatant(combat)!;
  if (cur.abilityStates.length === 0) return combat;

  const readyEntries: LogEntry[] = [];
  const abilityStates = cur.abilityStates.map((s): AbilityState => {
    switch (s.status) {
      case 'counting':
        if ((s.turnsRemaining ?? 0) <= 0) {
          readyEntries.push(abilityReadyEntry(combat, cur.id, s.actionId));
          return { actionId: s.actionId, status: 'ready', justReady: true };
        }
        // An un-armed (fixed-mode) countdown starts counting from this turn on.
        return { ...s, armed: true };
      case 'rollNeeded':
      case 'thresholdRoll':
        return { ...s, promptPending: true };
      default:
        return s;
    }
  });

  const next = mapCurrent(combat, (c) => ({ ...c, abilityStates }));
  return readyEntries.length ? { ...next, log: [...next.log, ...readyEntries] } : next;
}

/**
 * Called when a combatant's turn ends: end-timed condition durations anchored to it tick, armed
 * recharge countdowns tick, and transient prompt/notice flags clear.
 */
export function endTurn(combat: Combat): Combat {
  const first = currentCombatant(combat);
  if (!first) return combat;
  combat = tickConditions(combat, first.id, 'end');
  const cur = currentCombatant(combat)!;
  if (cur.abilityStates.length === 0) return combat;
  return mapCurrent(combat, (c) => ({
    ...c,
    abilityStates: c.abilityStates.map((s) => {
      const out: AbilityState = { ...s, promptPending: false, justReady: false };
      if (!c.isDead && s.status === 'counting' && s.armed) {
        out.turnsRemaining = Math.max(0, (s.turnsRemaining ?? 0) - 1);
      }
      return out;
    }),
  }));
}

/** Index of the next living combatant after `from`, and whether we wrapped to a new round. */
export function findNextIndex(
  combatants: readonly Combatant[],
  from: number,
): { index: number; wrapped: boolean } | null {
  const n = combatants.length;
  for (let step = 1; step <= n; step++) {
    const raw = from + step;
    const idx = raw % n;
    if (isActiveCombatant(combatants[idx]!)) return { index: idx, wrapped: raw >= n };
  }
  return null;
}

/** Ends the current turn, moves the pointer past the dead, wraps to the next round, starts the new turn. */
export function nextTurn(combat: Combat): Combat {
  if (combat.status !== 'active' || combat.combatants.length === 0) return combat;
  const ended = endTurn(combat);
  const next = findNextIndex(ended.combatants, ended.turnIndex);
  if (!next) return ended;
  return startTurn({
    ...ended,
    turnIndex: next.index,
    round: next.wrapped ? ended.round + 1 : ended.round,
  });
}

/** Sorts by initiative and starts round 1 on the first living combatant. */
export function beginCombat(combat: Combat): Combat {
  const combatants = sortInitiative(combat.combatants);
  const first = combatants.findIndex(isActiveCombatant);
  return startTurn({
    ...combat,
    combatants,
    status: 'active',
    round: 1,
    turnIndex: Math.max(0, first),
  });
}

export function endCombat(combat: Combat): Combat {
  return { ...endTurn(combat), status: 'ended' };
}

function abilityReadyEntry(combat: Combat, combatantId: string, actionId: string): LogEntry {
  return {
    id: newId(),
    type: 'abilityReady',
    round: combat.round,
    combatantId,
    actionId,
    at: Date.now(),
  };
}
