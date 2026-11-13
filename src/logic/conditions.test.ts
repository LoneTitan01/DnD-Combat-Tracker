import { describe, expect, it } from 'vitest';
import type { Combat } from '../models';
import { describeLogEntry } from './combat';
import {
  clearConditions,
  conditionLabel,
  describeDuration,
  normalizeConditions,
  setCondition,
  toggleCondition,
} from './conditions';
import { removeCombatant } from './staging';
import { beginCombat, nextTurn } from './turns';
import { makeCombat, makeCombatant } from './testUtils';

/** Aria (player, acts first) then a Goblin. One round = Aria's turn, Goblin's turn. */
function fight(): Combat {
  return beginCombat(
    makeCombat(
      [
        makeCombatant({ id: 'aria', kind: 'player', tokenName: 'Aria', initiative: 20 }),
        makeCombatant({ id: 'gob', tokenName: 'Goblin', initiative: 10 }),
      ],
      { status: 'staged', round: 0 },
    ),
  );
}
const conds = (c: Combat, id: string) => c.combatants.find((x) => x.id === id)!.conditions;
const names = (c: Combat, id: string) => conds(c, id).map((x) => x.name);
const turn = (c: Combat) => c.combatants[c.turnIndex]!.id;

describe('untimed conditions', () => {
  it('toggles on and off, kept in standard order', () => {
    let c = fight();
    c = toggleCondition(c, 'gob', 'prone');
    c = toggleCondition(c, 'gob', 'blinded');
    expect(names(c, 'gob')).toEqual(['blinded', 'prone']);
    c = toggleCondition(c, 'gob', 'prone');
    expect(names(c, 'gob')).toEqual(['blinded']);
  });

  it('never expire', () => {
    let c = toggleCondition(fight(), 'gob', 'prone');
    for (let i = 0; i < 10; i++) c = nextTurn(c);
    expect(names(c, 'gob')).toEqual(['prone']);
  });

  it('clears all', () => {
    let c = toggleCondition(toggleCondition(fight(), 'gob', 'prone'), 'gob', 'poisoned');
    c = clearConditions(c, 'gob');
    expect(conds(c, 'gob')).toEqual([]);
  });
});

describe('timed conditions on the affected creature’s turns', () => {
  it('"1 round, end" applied on another turn ends at the end of its next turn', () => {
    let c = setCondition(fight(), 'gob', 'prone', { rounds: 1, ends: 'end', anchorId: null }); // Aria's turn
    c = nextTurn(c); // Goblin's turn starts
    expect(turn(c)).toBe('gob');
    expect(names(c, 'gob')).toEqual(['prone']);
    c = nextTurn(c); // end of Goblin's turn
    expect(names(c, 'gob')).toEqual([]);
    expect(c.log.at(-1)).toMatchObject({ type: 'conditionEnded', combatantId: 'gob', condition: 'prone', round: 1 });
  });

  it('"1 round, end" applied during its own turn skips that turn', () => {
    let c = nextTurn(fight()); // Goblin's turn
    c = setCondition(c, 'gob', 'poisoned', { rounds: 1, ends: 'end', anchorId: null });
    expect(conds(c, 'gob')[0]).toMatchObject({ armed: false });
    c = nextTurn(c); // end of this turn: arms, doesn't count
    expect(names(c, 'gob')).toEqual(['poisoned']);
    c = nextTurn(nextTurn(c)); // Aria, then end of Goblin's next turn
    expect(names(c, 'gob')).toEqual([]);
  });

  it('"1 round, start" ends at the start of its next turn', () => {
    let c = setCondition(fight(), 'gob', 'frightened', { rounds: 1, ends: 'start', anchorId: null });
    c = nextTurn(c); // start of Goblin's turn
    expect(names(c, 'gob')).toEqual([]);
  });

  it('counts down over several rounds and shows the remaining count', () => {
    let c = setCondition(fight(), 'gob', 'restrained', { rounds: 3, ends: 'end', anchorId: null });
    expect(conditionLabel(conds(c, 'gob')[0]!)).toBe('restrained · 3');
    c = nextTurn(nextTurn(c)); // end of Goblin turn 1
    expect(conds(c, 'gob')[0]!.rounds).toBe(2);
    c = nextTurn(nextTurn(c)); // end of Goblin turn 2
    expect(conds(c, 'gob')[0]!.rounds).toBe(1);
    c = nextTurn(nextTurn(c)); // end of Goblin turn 3
    expect(names(c, 'gob')).toEqual([]);
    expect(c.round).toBe(4);
  });

  it('setting a duration again replaces it', () => {
    let c = setCondition(fight(), 'gob', 'prone', { rounds: 3, ends: 'end', anchorId: null });
    c = setCondition(c, 'gob', 'prone', { rounds: null, ends: 'end', anchorId: null });
    expect(conds(c, 'gob')).toEqual([{ name: 'prone' }]);
  });
});

describe('timed conditions anchored to another combatant (the caster)', () => {
  it('"until the end of your next turn" cast on your own turn lasts through your next turn', () => {
    // Aria (current) marks the goblin until the end of her next turn.
    let c = setCondition(fight(), 'gob', 'blinded', { rounds: 1, ends: 'end', anchorId: 'aria' });
    expect(conds(c, 'gob')[0]).toMatchObject({ anchorId: 'aria', armed: false });
    c = nextTurn(c); // end of Aria's casting turn: arms
    c = nextTurn(c); // end of Goblin's turn: not the anchor
    expect(names(c, 'gob')).toEqual(['blinded']);
    expect(turn(c)).toBe('aria');
    c = nextTurn(c); // end of Aria's next turn
    expect(names(c, 'gob')).toEqual([]);
    expect(c.log.at(-1)).toMatchObject({ type: 'conditionEnded', combatantId: 'gob' });
  });

  it('anchoring to the affected creature itself is stored as no anchor', () => {
    const c = setCondition(fight(), 'gob', 'prone', { rounds: 2, ends: 'end', anchorId: 'gob' });
    expect(conds(c, 'gob')[0]!.anchorId).toBeUndefined();
  });

  it('falls back to the affected creature when the anchor leaves the combat', () => {
    let c = setCondition(fight(), 'gob', 'charmed', { rounds: 1, ends: 'end', anchorId: 'aria' });
    c = removeCombatant(c, 'aria'); // Goblin's turn now
    expect(turn(c)).toBe('gob');
    c = nextTurn(c); // end of Goblin's turn (it's alone)
    expect(names(c, 'gob')).toEqual([]);
  });

  it('a dead anchor skips its turns, so its durations stop counting', () => {
    let c = setCondition(fight(), 'aria', 'deafened', { rounds: 1, ends: 'start', anchorId: 'gob' });
    c = { ...c, combatants: c.combatants.map((x) => (x.id === 'gob' ? { ...x, isDead: true } : x)) };
    for (let i = 0; i < 4; i++) c = nextTurn(c);
    expect(names(c, 'aria')).toEqual(['deafened']);
  });
});

describe('labels, log text and old saves', () => {
  it('describes a duration', () => {
    expect(describeDuration({ name: 'prone' }, 'Goblin')).toBe('until removed');
    expect(describeDuration({ name: 'prone', rounds: 2, ends: 'start' }, 'Aria')).toBe(
      "2 rounds, ends at the start of Aria's turn",
    );
  });

  it('logs the expiry in plain words', () => {
    let c = setCondition(fight(), 'gob', 'prone', { rounds: 1, ends: 'start', anchorId: null });
    c = nextTurn(c);
    const e = c.log.at(-1)!;
    expect(describeLogEntry(e, () => 'Goblin', () => '')).toBe('Goblin is no longer prone');
  });

  it('upgrades plain-name conditions from older saves', () => {
    expect(normalizeConditions(['prone', 'nonsense', { name: 'blinded', rounds: 2 }])).toEqual([
      { name: 'prone' },
      { name: 'blinded', rounds: 2 },
    ]);
    expect(normalizeConditions(undefined)).toEqual([]);
  });
});
