import { describe, expect, it } from 'vitest';
import {
  applyPlayerAction,
  hostPeerId,
  makeJoinCode,
  normalizeJoinCode,
  parsePlayerMessage,
  remoteView,
  setCondition,
} from '.';
import { makeCombat, makeCombatant } from './testUtils';

const party = () => {
  const aria = makeCombatant({ id: 'aria', kind: 'player', tokenName: 'Aria', initiative: 18, dexScore: undefined, notes: 'secret' });
  const gob = makeCombatant({ id: 'gob', tokenName: 'Goblin 1', initiative: 12, creatureName: 'Goblin', notes: 'flees at 3 HP' });
  const dead = makeCombatant({ id: 'dead', tokenName: 'Goblin 2', initiative: 10, isDead: true });
  const brom = makeCombatant({ id: 'brom', kind: 'player', tokenName: 'Brom', initiative: 5, dexScore: undefined });
  return makeCombat([aria, gob, dead, brom], { id: 'cb', name: 'Ambush', turnIndex: 1, round: 2 });
};

describe('join codes', () => {
  it('are six unambiguous characters', () => {
    let i = 0;
    const code = makeJoinCode(() => (i++ % 10) / 10);
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(normalizeJoinCode(code)).toBe(code);
  });

  it('tidy what players type', () => {
    expect(normalizeJoinCode(' abc-23x ')).toBe('ABC23X');
    expect(normalizeJoinCode('ABC23')).toBeNull();
    expect(normalizeJoinCode('ABC230')).toBeNull(); // 0 is never in a code
    expect(hostPeerId('ABC23X')).toBe('dm-combat-tracker-ABC23X');
  });
});

describe('remoteView', () => {
  it('lists living combatants in order and the players, with no HP, notes or creature conditions', () => {
    const combat = setCondition(party(), 'gob', 'prone');
    const v = remoteView(combat);
    expect(v.order.map((t) => [t.name, t.kind, t.current])).toEqual([
      ['Aria', 'player', false],
      ['Goblin 1', 'creature', true],
      ['Brom', 'player', false],
    ]);
    expect(v.order[1]!.creature).toBe('Goblin');
    expect(v.players).toEqual([
      { id: 'aria', name: 'Aria', initiative: 18, conditions: [] },
      { id: 'brom', name: 'Brom', initiative: 5, conditions: [] },
    ]);
    const wire = JSON.stringify(v);
    for (const secret of ['currentHP', 'maxHP', 'notes', 'secret', 'flees', 'prone', 'xp']) expect(wire).not.toContain(secret);
    expect(v.table.status).toBe('active');
  });

  it('has no turn order before the combat starts', () => {
    const v = remoteView({ ...party(), status: 'staged' });
    expect(v.order).toEqual([]);
    expect(v.table).toEqual({ status: 'waiting' });
  });
});

describe('player messages', () => {
  it('accepts well-formed actions only', () => {
    expect(parsePlayerMessage({ type: 'hello' })).toEqual({ type: 'hello' });
    const ok = { type: 'action', action: { type: 'setInitiative', combatantId: 'aria', initiative: 15 } };
    expect(parsePlayerMessage(ok)).toEqual(ok);
    expect(parsePlayerMessage({ type: 'action', action: { type: 'setInitiative', combatantId: 'aria', initiative: null } })).not.toBeNull();
    for (const bad of [
      null,
      'hello',
      { type: 'action', action: { type: 'setInitiative', combatantId: 'aria', initiative: 1.5 } },
      { type: 'action', action: { type: 'setInitiative', combatantId: 'aria', initiative: 1000 } },
      { type: 'action', action: { type: 'setCondition', combatantId: 'aria', condition: 'cursed', on: true } },
      { type: 'action', action: { type: 'setCondition', combatantId: 'aria', condition: 'prone' } },
      { type: 'action', action: { type: 'damage', combatantId: 'gob', amount: 99 } },
    ]) {
      expect(parsePlayerMessage(bad)).toBeNull();
    }
  });
});

describe('applyPlayerAction', () => {
  it('changes a player character’s initiative and re-sorts without moving the turn', () => {
    const c = applyPlayerAction(party(), { type: 'setInitiative', combatantId: 'brom', initiative: 20 });
    expect(c.combatants.map((x) => x.id)).toEqual(['brom', 'aria', 'gob', 'dead']);
    expect(c.combatants[c.turnIndex]!.id).toBe('gob');
  });

  it('toggles conditions on a player character and keeps a DM-set duration', () => {
    let c = applyPlayerAction(party(), { type: 'setCondition', combatantId: 'aria', condition: 'prone', on: true });
    expect(c.combatants[0]!.conditions).toEqual([{ name: 'prone' }]);
    c = applyPlayerAction(c, { type: 'setCondition', combatantId: 'aria', condition: 'prone', on: false });
    expect(c.combatants[0]!.conditions).toEqual([]);

    const timed = setCondition(party(), 'aria', 'blinded', { rounds: 2, ends: 'end', anchorId: null });
    expect(applyPlayerAction(timed, { type: 'setCondition', combatantId: 'aria', condition: 'blinded', on: true })).toBe(timed);
  });

  it('never touches creatures, unknown combatants or an ended combat', () => {
    const combat = party();
    expect(applyPlayerAction(combat, { type: 'setInitiative', combatantId: 'gob', initiative: 1 })).toBe(combat);
    expect(applyPlayerAction(combat, { type: 'setCondition', combatantId: 'gob', condition: 'prone', on: true })).toBe(combat);
    expect(applyPlayerAction(combat, { type: 'setInitiative', combatantId: 'nobody', initiative: 1 })).toBe(combat);
    const ended = { ...combat, status: 'ended' as const };
    expect(applyPlayerAction(ended, { type: 'setInitiative', combatantId: 'aria', initiative: 1 })).toBe(ended);
  });
});
