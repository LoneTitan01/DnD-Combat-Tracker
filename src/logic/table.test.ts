import { describe, expect, it } from 'vitest';
import type { Combat } from '../models';
import { setAlly, setCreatureDisplay } from './combat';
import { remoteView } from './remote';
import { tableView } from './table';
import { makeCombat, makeCombatant } from './testUtils';

/** The plan's example order: Aria, Brom, Goblin 2, Cass. */
function example(turnIndex: number, overrides: Partial<Combat> = {}): Combat {
  return makeCombat(
    [
      makeCombatant({ kind: 'player', tokenName: 'Aria' }),
      makeCombatant({ kind: 'player', tokenName: 'Brom' }),
      makeCombatant({ kind: 'creature', tokenName: 'Goblin 2' }),
      makeCombatant({ kind: 'player', tokenName: 'Cass' }),
    ],
    { turnIndex, round: 2, ...overrides },
  );
}

describe('tableView', () => {
  it('shows waiting before the combat starts and over after it ends', () => {
    expect(tableView(null)).toEqual({ status: 'waiting' });
    expect(tableView(example(0, { status: 'staged' }))).toEqual({ status: 'waiting' });
    expect(tableView(example(0, { status: 'ended' }))).toEqual({ status: 'over' });
  });

  it("Aria's turn: Aria + Brom now, Goblin 2 up next", () => {
    expect(tableView(example(0))).toEqual({
      status: 'active',
      round: 2,
      current: { kind: 'player', ally: false, names: ['Aria', 'Brom'], creatures: [null, null] },
      upNext: { kind: 'creature', ally: false, names: ['Goblin 2'], creatures: [null], newRound: false },
    });
  });

  it("Brom's turn: Brom now, Goblin 2 up next", () => {
    const v = tableView(example(1));
    expect(v).toMatchObject({ current: { names: ['Brom'] }, upNext: { names: ['Goblin 2'] } });
  });

  it("Goblin's turn: up next groups Cass with Aria and Brom across the round boundary", () => {
    const v = tableView(example(2));
    expect(v).toMatchObject({
      current: { kind: 'creature', names: ['Goblin 2'] },
      upNext: { kind: 'player', names: ['Cass', 'Aria', 'Brom'], newRound: false },
    });
  });

  it("Cass's turn: the group wraps, and the goblin is up next in the new round", () => {
    const v = tableView(example(3));
    expect(v).toMatchObject({
      current: { names: ['Cass', 'Aria', 'Brom'] },
      upNext: { names: ['Goblin 2'], newRound: true },
    });
  });

  it('flags a new round when up next wraps past the end', () => {
    const c = makeCombat(
      [makeCombatant({ tokenName: 'Ogre' }), makeCombatant({ kind: 'player', tokenName: 'Aria' })],
      { turnIndex: 1 },
    );
    expect(tableView(c)).toMatchObject({ upNext: { names: ['Ogre'], newRound: true } });
  });

  it('never shows dead creatures, and they do not split a run of players', () => {
    const c = example(0);
    c.combatants[2] = { ...c.combatants[2]!, isDead: true };
    expect(tableView(c)).toMatchObject({ current: { names: ['Aria', 'Brom', 'Cass'] }, upNext: null });
  });

  it('skips dead creatures when finding up next', () => {
    const c = makeCombat(
      [
        makeCombatant({ tokenName: 'Goblin 1' }),
        makeCombatant({ tokenName: 'Goblin 2', isDead: true }),
        makeCombatant({ tokenName: 'Goblin 3' }),
      ],
      { turnIndex: 0 },
    );
    expect(tableView(c)).toMatchObject({ upNext: { names: ['Goblin 3'] } });
  });

  it('has no up next when the current combatant is the only one alive', () => {
    const c = makeCombat([makeCombatant({ tokenName: 'Lich' })]);
    expect(tableView(c)).toMatchObject({ current: { names: ['Lich'] }, upNext: null });
  });
});

describe('tableView kind of creature', () => {
  const boar = () => makeCombatant({ tokenName: 'Tusker', templateId: 'tpl-boar', creatureName: 'Boar' });
  const current = (c: Combat, templates?: Parameters<typeof tableView>[1]) => {
    const v = tableView(c, templates);
    return v.status === 'active' ? v.current.creatures : undefined;
  };

  it("shows the stat block's name, looking it up for combatants added before it was snapshotted", () => {
    expect(current(makeCombat([boar()]))).toEqual(['Boar']);
    const old = makeCombatant({ tokenName: 'Grunt', templateId: 'tpl-orc' });
    expect(current(makeCombat([old]))).toEqual([null]);
    expect(current(makeCombat([old]), new Map([['tpl-orc', { name: 'Orc' }]]))).toEqual(['Orc']);
  });

  it('shows the fake only while the toggle is on, and nothing for a blank fake', () => {
    const b = boar();
    let c = setCreatureDisplay(makeCombat([b]), b.id, { fakeName: 'Orc' });
    expect(current(c)).toEqual(['Boar']);
    c = setCreatureDisplay(c, b.id, { showFakeName: true });
    expect(current(c)).toEqual(['Orc']);
    expect(current(setCreatureDisplay(c, b.id, { fakeName: '  ' }))).toEqual([null]);
    expect(setCreatureDisplay(c, b.id, { showFakeName: true })).toBe(c);
  });

  it('never shows one for players', () => {
    const p = makeCombatant({ kind: 'player', tokenName: 'Aria', creatureName: 'Elf' });
    expect(current(makeCombat([p]))).toEqual([null]);
  });
});

describe('allies', () => {
  it('flags an allied creature in the table and player-device views', () => {
    let c = example(2);
    const goblin = c.combatants[2]!;
    expect(tableView(c)).toMatchObject({ current: { ally: false } });
    c = setAlly(c, goblin.id, true);
    expect(tableView(c)).toMatchObject({ current: { kind: 'creature', ally: true }, upNext: { ally: false } });
    expect(remoteView(c).order.map((t) => t.ally)).toEqual([false, false, true, false]);
  });

  it('only marks creatures, clears the flag when unset, and ignores no-op changes', () => {
    const c = example(0);
    const [aria, , goblin] = c.combatants;
    expect(setAlly(c, aria!.id, true)).toBe(c);
    expect(setAlly(c, goblin!.id, false)).toBe(c);
    const on = setAlly(c, goblin!.id, true);
    expect(on.combatants[2]!.ally).toBe(true);
    expect(setAlly(on, goblin!.id, true)).toBe(on);
    expect('ally' in setAlly(on, goblin!.id, false).combatants[2]!).toBe(false);
  });
});
