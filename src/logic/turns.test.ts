import { describe, expect, it } from 'vitest';
import type { AbilityState, Combat, Combatant } from '../models';
import { moveCombatant, sortInitiative } from './initiative';
import { beginCombat, nextTurn } from './turns';
import {
  canUndo,
  dismissPrompt,
  pendingPrompts,
  resolveRolledRecharge,
  resolveThresholdRoll,
  undoLogEntry,
  useAbility,
} from './combat';
import { makeCombat, makeCombatant } from './testUtils';

const names = (c: Combat) => c.combatants.map((x) => x.tokenName);
const current = (c: Combat) => c.combatants[c.turnIndex]!;

describe('sortInitiative', () => {
  it('sorts high to low', () => {
    const list = [
      makeCombatant({ tokenName: 'A', initiative: 5 }),
      makeCombatant({ tokenName: 'B', initiative: 18 }),
      makeCombatant({ tokenName: 'C', initiative: 12 }),
    ];
    expect(sortInitiative(list).map((c) => c.tokenName)).toEqual(['B', 'C', 'A']);
  });

  it('breaks ties on DEX score', () => {
    const list = [
      makeCombatant({ tokenName: 'Slow', initiative: 12, dexScore: 10 }),
      makeCombatant({ tokenName: 'Quick', initiative: 12, dexScore: 16 }),
    ];
    expect(sortInitiative(list).map((c) => c.tokenName)).toEqual(['Quick', 'Slow']);
  });

  it('keeps existing order on full ties (manual drag)', () => {
    const list = [
      makeCombatant({ tokenName: 'Second', initiative: 12, dexScore: 14 }),
      makeCombatant({ tokenName: 'First', initiative: 12, dexScore: 14 }),
    ];
    expect(sortInitiative(list).map((c) => c.tokenName)).toEqual(['Second', 'First']);
  });

  it('puts combatants without initiative last', () => {
    const list = [
      makeCombatant({ tokenName: 'None', initiative: null }),
      makeCombatant({ tokenName: 'Low', initiative: 1 }),
    ];
    expect(sortInitiative(list).map((c) => c.tokenName)).toEqual(['Low', 'None']);
  });
});

describe('nextTurn', () => {
  const setup = () =>
    beginCombat(
      makeCombat(
        [
          makeCombatant({ tokenName: 'A', initiative: 20 }),
          makeCombatant({ tokenName: 'B', initiative: 15 }),
          makeCombatant({ tokenName: 'C', initiative: 10 }),
        ],
        { status: 'staged', round: 0 },
      ),
    );

  it('begins round 1 on the highest initiative', () => {
    const c = setup();
    expect(c.status).toBe('active');
    expect(c.round).toBe(1);
    expect(current(c).tokenName).toBe('A');
  });

  it('advances the pointer', () => {
    expect(current(nextTurn(setup())).tokenName).toBe('B');
  });

  it('wraps to the next round after the last combatant', () => {
    let c = setup();
    c = nextTurn(nextTurn(nextTurn(c)));
    expect(current(c).tokenName).toBe('A');
    expect(c.round).toBe(2);
  });

  it('skips the dead', () => {
    let c = setup();
    c = { ...c, combatants: c.combatants.map((x) => (x.tokenName === 'B' ? { ...x, isDead: true } : x)) };
    c = nextTurn(c);
    expect(current(c).tokenName).toBe('C');
  });

  it('skips a dead first combatant when wrapping', () => {
    let c = nextTurn(nextTurn(setup())); // C's turn
    c = { ...c, combatants: c.combatants.map((x) => (x.tokenName === 'A' ? { ...x, isDead: true } : x)) };
    c = nextTurn(c);
    expect(current(c).tokenName).toBe('B');
    expect(c.round).toBe(2);
  });

  it('does nothing when the combat is not active', () => {
    const staged = makeCombat([makeCombatant(), makeCombatant()], { status: 'staged' });
    expect(nextTurn(staged)).toBe(staged);
  });

  it('manual reorder keeps the pointer on the same combatant', () => {
    let c = nextTurn(setup()); // B's turn, index 1
    c = moveCombatant(c, 2, 0); // C to the top
    expect(names(c)).toEqual(['C', 'A', 'B']);
    expect(current(c).tokenName).toBe('B');
  });
});

// ---------- recharge ----------

/** Two-combatant combat: Dragon (acts first) and a Fighter. Each round = Dragon turn, Fighter turn. */
function dragonCombat(state: AbilityState = { actionId: 'breath', status: 'ready' }) {
  const dragon = makeCombatant({ id: 'dragon', tokenName: 'Dragon', initiative: 20, abilityStates: [state] });
  const fighter = makeCombatant({ id: 'fighter', kind: 'player', tokenName: 'Fighter', initiative: 10 });
  return beginCombat(makeCombat([dragon, fighter], { status: 'staged', round: 0 }));
}

const breath = (c: Combat): AbilityState => c.combatants.find((x) => x.id === 'dragon')!.abilityStates[0]!;
const dragon = (c: Combat): Combatant => c.combatants.find((x) => x.id === 'dragon')!;
/** Advance until it's the dragon's turn again (one full round). */
const toNextDragonTurn = (c: Combat) => nextTurn(nextTurn(c));

describe('recharge: fixed', () => {
  it('fixed 2 used in round 1 is ready in round 4', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'fixed', turns: 2 });
    expect(breath(c)).toMatchObject({ status: 'counting', turnsRemaining: 2 });

    c = toNextDragonTurn(c); // round 2: the use turn didn't count
    expect(c.round).toBe(2);
    expect(breath(c)).toMatchObject({ status: 'counting', turnsRemaining: 2, armed: true });

    c = toNextDragonTurn(c); // round 3
    expect(breath(c)).toMatchObject({ status: 'counting', turnsRemaining: 1 });

    c = toNextDragonTurn(c); // round 4
    expect(c.round).toBe(4);
    expect(breath(c)).toMatchObject({ status: 'ready', justReady: true });
    expect(c.log.some((e) => e.type === 'abilityReady')).toBe(true);
  });

  it('clears the ready notice when the turn ends', () => {
    let c = dragonCombat({ actionId: 'breath', status: 'counting', turnsRemaining: 0, armed: true });
    // beginCombat started the dragon's turn → ready
    expect(breath(c).justReady).toBe(true);
    c = nextTurn(c);
    expect(breath(c).justReady).toBe(false);
  });
});

describe('recharge: rolled', () => {
  it('prompts on the next turn, not the use turn', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'rolled', dice: '1d6' });
    expect(breath(c).status).toBe('rollNeeded');
    expect(pendingPrompts(dragon(c))).toHaveLength(0);

    c = toNextDragonTurn(c);
    expect(pendingPrompts(dragon(c))).toEqual([{ combatantId: 'dragon', actionId: 'breath', kind: 'rolled' }]);
  });

  it('used R1, rolled 2 in R2 → R2 and R3 count, ready in R4 (entry turn counts)', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'rolled', dice: '1d6' });
    c = toNextDragonTurn(c); // R2
    c = resolveRolledRecharge(c, 'dragon', 'breath', 2);
    expect(breath(c)).toMatchObject({ status: 'counting', turnsRemaining: 2 });

    c = toNextDragonTurn(c); // R3
    expect(breath(c)).toMatchObject({ status: 'counting', turnsRemaining: 1 });

    c = toNextDragonTurn(c); // R4
    expect(c.round).toBe(4);
    expect(breath(c).status).toBe('ready');
  });

  it('a dismissed prompt returns next turn and that turn does not count', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'rolled', dice: '1d6' });
    c = toNextDragonTurn(c); // R2: prompt
    c = dismissPrompt(c, 'dragon', 'breath');
    expect(pendingPrompts(dragon(c))).toHaveLength(0);

    c = toNextDragonTurn(c); // R3: prompt again, still rollNeeded
    expect(breath(c).status).toBe('rollNeeded');
    expect(pendingPrompts(dragon(c))).toHaveLength(1);

    c = resolveRolledRecharge(c, 'dragon', 'breath', 1);
    c = toNextDragonTurn(c); // R4
    expect(breath(c).status).toBe('ready');
  });
});

describe('recharge: threshold (Recharge 5–6)', () => {
  it('fails below the threshold and asks again next turn', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'threshold', minRoll: 5 });
    expect(pendingPrompts(dragon(c))).toHaveLength(0);

    c = toNextDragonTurn(c);
    expect(pendingPrompts(dragon(c))).toEqual([{ combatantId: 'dragon', actionId: 'breath', kind: 'threshold' }]);
    c = resolveThresholdRoll(c, 'dragon', 'breath', 4, 5);
    expect(breath(c).status).toBe('thresholdRoll');
    expect(pendingPrompts(dragon(c))).toHaveLength(0);

    c = toNextDragonTurn(c);
    expect(pendingPrompts(dragon(c))).toHaveLength(1);
  });

  it('is ready immediately on a success', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'threshold', minRoll: 5 });
    c = toNextDragonTurn(c);
    c = resolveThresholdRoll(c, 'dragon', 'breath', 5, 5);
    expect(breath(c)).toMatchObject({ status: 'ready', justReady: true });
  });

  it('respects Recharge 6', () => {
    let c = dragonCombat({ actionId: 'breath', status: 'thresholdRoll' });
    c = resolveThresholdRoll(c, 'dragon', 'breath', 5, 6);
    expect(breath(c).status).toBe('thresholdRoll');
  });
});

describe('recharge: per-instance and dead creatures', () => {
  it('tracks two dragons separately', () => {
    const a = makeCombatant({ id: 'a', initiative: 20, abilityStates: [{ actionId: 'breath', status: 'ready' }] });
    const b = makeCombatant({ id: 'b', initiative: 10, abilityStates: [{ actionId: 'breath', status: 'ready' }] });
    let c = beginCombat(makeCombat([a, b], { status: 'staged' }));
    c = useAbility(c, 'a', 'breath', { mode: 'fixed', turns: 1 });
    expect(c.combatants[0]!.abilityStates[0]!.status).toBe('counting');
    expect(c.combatants[1]!.abilityStates[0]!.status).toBe('ready');
  });

  it('dead creatures do not count down', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'fixed', turns: 1 });
    c = { ...c, combatants: c.combatants.map((x) => (x.id === 'dragon' ? { ...x, isDead: true } : x)) };
    c = nextTurn(nextTurn(nextTurn(c)));
    expect(breath(c)).toMatchObject({ status: 'counting', turnsRemaining: 1 });
  });
});

describe('recharge undo', () => {
  it('undoing a use restores the ready state', () => {
    let c = dragonCombat();
    c = useAbility(c, 'dragon', 'breath', { mode: 'threshold', minRoll: 5 });
    const entry = c.log.find((e) => e.type === 'abilityUsed')!;
    expect(canUndo(c, entry.id)).toBe(true);
    c = undoLogEntry(c, entry.id);
    expect(breath(c).status).toBe('ready');
  });
});
