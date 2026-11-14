import { describe, expect, it } from 'vitest';
import type { Combat } from '../models';
import {
  canUndo,
  damageCombatant,
  describeLogEntry,
  healCombatant,
  livingCreatureCount,
  resolveRolledRecharge,
  resolveThresholdRoll,
  reviveCombatant,
  setCombatantNotes,
  tempHPCombatant,
  undoLogEntry,
  useAbility,
} from './combat';
import { changeInitiative, resetCreatureHP, setCreatureHP } from './staging';
import { nextTurn } from './turns';
import { dieRng, makeCombat, makeCombatant, makeTemplate } from './testUtils';

const names = (c: Combat) => c.combatants.map((x) => x.tokenName);
const current = (c: Combat) => c.combatants[c.turnIndex]!.tokenName;

describe('temp HP', () => {
  it('logs, keeps the higher value, and can be undone', () => {
    const g = makeCombatant({ currentHP: 10, maxHP: 10 });
    let c = tempHPCombatant(makeCombat([g]), g.id, 5);
    expect(c.combatants[0]!.tempHP).toBe(5);
    expect(c.log[0]).toMatchObject({ type: 'tempHP', rawDamage: 5 });
    expect(tempHPCombatant(c, g.id, 3)).toBe(c); // lower value: no change, no log
    c = undoLogEntry(c, c.log[0]!.id);
    expect(c.combatants[0]!.tempHP).toBe(0);
  });

  it('is in the same undo stream as damage', () => {
    const g = makeCombatant({ currentHP: 10, maxHP: 10 });
    let c = tempHPCombatant(makeCombat([g]), g.id, 5);
    c = damageCombatant(c, g.id, 3, 'normal');
    expect(canUndo(c, c.log[0]!.id)).toBe(false);
  });
});

describe('staging HP', () => {
  it('sets max and current HP together', () => {
    const g = makeCombatant({ currentHP: 7, maxHP: 7 });
    const c = setCreatureHP(makeCombat([g], { status: 'staged' }), g.id, 12);
    expect(c.combatants[0]).toMatchObject({ maxHP: 12, currentHP: 12 });
  });

  it('never goes below 1', () => {
    const g = makeCombatant();
    expect(setCreatureHP(makeCombat([g]), g.id, 0).combatants[0]!.maxHP).toBe(1);
  });

  it('resets to average or rolls from hit dice', () => {
    const t = makeTemplate({ maxHP: 52, hitDice: { count: 7, dieType: 'd10', bonus: 14 } });
    const g = makeCombatant({ templateId: t.id, maxHP: 5, currentHP: 5 });
    const c = makeCombat([g], { status: 'staged' });
    expect(resetCreatureHP(c, g.id, t, 'average').combatants[0]!.maxHP).toBe(52);
    expect(resetCreatureHP(c, g.id, t, 'rolled', dieRng([10, 10])).combatants[0]!.maxHP).toBe(84);
  });
});

describe('changeInitiative', () => {
  const setup = () =>
    makeCombat(
      [
        makeCombatant({ tokenName: 'A', initiative: 20 }),
        makeCombatant({ tokenName: 'B', initiative: 15 }),
        makeCombatant({ tokenName: 'C', initiative: 10 }),
        makeCombatant({ tokenName: 'D', initiative: 5 }),
      ],
      { turnIndex: 1 },
    );

  it('moves the combatant without moving the turn pointer', () => {
    const c0 = setup();
    const c = changeInitiative(c0, c0.combatants[3]!.id, 18);
    expect(names(c)).toEqual(['A', 'D', 'B', 'C']);
    expect(current(c)).toBe('B');
  });

  it('moves the current combatant and the pointer follows it', () => {
    const c0 = setup();
    const c = changeInitiative(c0, c0.combatants[1]!.id, 1);
    expect(names(c)).toEqual(['A', 'C', 'D', 'B']);
    expect(current(c)).toBe('B');
  });

  it('keeps a manual drag among the others', () => {
    let c = setup();
    // Manual order: C dragged above B.
    c = { ...c, combatants: [c.combatants[0]!, c.combatants[2]!, c.combatants[1]!, c.combatants[3]!] };
    c = changeInitiative(c, c.combatants[0]!.id, 1);
    expect(names(c)).toEqual(['C', 'B', 'D', 'A']);
  });

  it('only sets the value while staged', () => {
    const c0 = { ...setup(), status: 'staged' as const };
    const c = changeInitiative(c0, c0.combatants[3]!.id, 30);
    expect(names(c)).toEqual(['A', 'B', 'C', 'D']);
    expect(c.combatants[3]!.initiative).toBe(30);
  });
});

describe('livingCreatureCount', () => {
  it('ignores players and the dead', () => {
    const c = makeCombat([
      makeCombatant(),
      makeCombatant({ isDead: true }),
      makeCombatant({ kind: 'player' }),
    ]);
    expect(livingCreatureCount(c)).toBe(1);
  });
});

describe('describeLogEntry', () => {
  const g = makeCombatant({
    id: 'g',
    tokenName: 'Goblin 1',
    currentHP: 7,
    maxHP: 7,
    abilityStates: [{ actionId: 'breath', status: 'ready' }],
  });
  const name = (id: string) => (id === 'g' ? 'Goblin 1' : 'someone');
  const action = () => 'Fire Breath';
  const text = (c: Combat) => c.log.map((e) => describeLogEntry(e, name, action));

  it('describes damage, death, healing, revival and temp HP', () => {
    let c = makeCombat([g]);
    c = damageCombatant(c, 'g', 4, 'normal');
    c = damageCombatant(c, 'g', 7, 'resisted');
    c = healCombatant(c, 'g', 2);
    c = damageCombatant(c, 'g', 2, 'vulnerable');
    c = reviveCombatant(c, 'g');
    c = tempHPCombatant(c, 'g', 4);
    expect(text(c)).toEqual([
      'Goblin 1 takes 4 damage → 3 HP',
      'Goblin 1 takes 3 damage (7 resisted) → 0 HP and dies',
      'Goblin 1 is revived → 2 HP',
      'Goblin 1 takes 4 damage (2 vulnerable) → 0 HP and dies',
      'Goblin 1 is revived → 1 HP',
      'Goblin 1 gains 4 temp HP',
    ]);
  });

  it('describes ability use and recharge rolls', () => {
    let c = makeCombat([g]);
    c = useAbility(c, 'g', 'breath', { mode: 'rolled', dice: '1d6' });
    c = resolveRolledRecharge(c, 'g', 'breath', 2);
    c = nextTurn(nextTurn(nextTurn(c)));
    let t = makeCombat([g]);
    t = useAbility(t, 'g', 'breath', { mode: 'threshold', minRoll: 5 });
    t = resolveThresholdRoll(t, 'g', 'breath', 3, 5);
    expect(text(c)).toEqual([
      'Goblin 1 uses Fire Breath',
      'Goblin 1: Fire Breath ready in 2 turns',
      'Goblin 1: Fire Breath is ready',
    ]);
    expect(text(t)).toEqual(['Goblin 1 uses Fire Breath', 'Goblin 1: Fire Breath recharge roll 3']);
  });
});

describe('combatant notes', () => {
  it('sets, clears, and survives undoing damage', () => {
    const g = makeCombatant({ currentHP: 10, maxHP: 10 });
    let c = makeCombat([g]);
    expect(setCombatantNotes(c, g.id, '')).toBe(c); // no change
    c = damageCombatant(c, g.id, 3, 'normal');
    c = setCombatantNotes(c, g.id, 'Flees below 5 HP');
    expect(c.combatants[0]!.notes).toBe('Flees below 5 HP');
    c = undoLogEntry(c, c.log[0]!.id);
    expect(c.combatants[0]!.notes).toBe('Flees below 5 HP');
    c = setCombatantNotes(c, g.id, '   ');
    expect('notes' in c.combatants[0]!).toBe(false);
  });
});
