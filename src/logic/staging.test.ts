import { describe, expect, it } from 'vitest';
import type { Encounter } from '../models';
import {
  addCreature,
  addPlayer,
  duplicateTokenNames,
  nextTokenName,
  removeCombatant,
  renameToken,
  stageCombat,
  startCombat,
} from './staging';
import { nextTurn } from './turns';
import { dieRng, makePlayer, makeTemplate } from './testUtils';

const goblin = makeTemplate({ name: 'Goblin', maxHP: 7, abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 } });
const dragon = makeTemplate({
  name: 'Young Red Dragon',
  maxHP: 178,
  hitDice: { count: 17, dieType: 'd10', bonus: 85 },
  abilities: { str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19 },
  xp: 5900,
  cr: '10',
  actions: [
    { id: 'bite', name: 'Bite', description: '', kind: 'action' },
    { id: 'breath', name: 'Fire Breath', description: '', kind: 'action', recharge: { mode: 'threshold', minRoll: 5 } },
  ],
});
const templates = new Map([goblin, dragon].map((t) => [t.id, t]));

const encounter: Encounter = {
  id: 'enc-1',
  name: 'Goblin Ambush',
  description: '',
  entries: [
    { templateId: goblin.id, count: 3 },
    { templateId: dragon.id, count: 1 },
  ],
  tags: [],
  createdAt: 0,
  updatedAt: 0,
};

describe('token names', () => {
  it('auto-numbers', () => {
    expect(nextTokenName('Goblin', [])).toBe('Goblin 1');
    expect(nextTokenName('Goblin', ['Goblin 1', 'Goblin 3'])).toBe('Goblin 4');
    expect(nextTokenName('Goblin', ['Goblin'])).toBe('Goblin 2');
    expect(nextTokenName('Goblin', ['Goblin Boss 1'])).toBe('Goblin 1');
  });
});

describe('stageCombat', () => {
  it('expands entries into creature combatants without players', () => {
    const c = stageCombat(encounter, templates);
    expect(c.status).toBe('staged');
    expect(c.combatants.map((x) => x.tokenName)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3', 'Young Red Dragon 1']);
    expect(c.combatants.every((x) => x.kind === 'creature')).toBe(true);
    expect(c.combatants.every((x) => x.initiative === null)).toBe(true);
  });

  it('uses average HP by default, rolled on request', () => {
    expect(stageCombat(encounter, templates).combatants[3]!.maxHP).toBe(178);
    const rolled = stageCombat(encounter, templates, { hpMode: 'rolled', rng: dieRng([1, 10]) });
    expect(rolled.combatants[3]!.maxHP).toBe(17 + 85);
  });

  it('creates ability states only for recharging actions', () => {
    const d = stageCombat(encounter, templates).combatants[3]!;
    expect(d.abilityStates).toEqual([{ actionId: 'breath', status: 'ready' }]);
  });

  it('pre-rolls initiative with DEX mod when asked', () => {
    const c = stageCombat(encounter, templates, { rollInitiative: true, rng: dieRng([10, 20]) });
    expect(c.combatants[0]!.initiative).toBe(12); // goblin DEX 14 → +2
    expect(c.combatants[3]!.initiative).toBe(10); // dragon DEX 10 → +0
  });

  it('warns on duplicate token names', () => {
    let c = stageCombat(encounter, templates);
    c = renameToken(c, c.combatants[1]!.id, 'goblin 1');
    expect(duplicateTokenNames(c)).toEqual(new Set(['goblin 1']));
  });
});

describe('startCombat', () => {
  it('adds players, rolls missing creature initiative and starts round 1', () => {
    let c = stageCombat(encounter, templates);
    c = { ...c, combatants: c.combatants.map((x, i) => (i === 0 ? { ...x, initiative: 25 } : x)) };
    const aria = makePlayer({ name: 'Aria' });
    const brom = makePlayer({ name: 'Brom' });
    c = startCombat(
      c,
      [
        { player: aria, initiative: 18 },
        { player: brom, initiative: 3 },
      ],
      dieRng([5, 20]),
    );
    expect(c.status).toBe('active');
    expect(c.round).toBe(1);
    expect(c.combatants.every((x) => x.initiative !== null)).toBe(true);
    expect(c.combatants[0]!.tokenName).toBe('Goblin 1'); // pre-rolled 25
    expect(c.combatants[1]!.tokenName).toBe('Aria');
    expect(c.combatants.at(-1)!.tokenName).toBe('Brom');
    expect(c.turnIndex).toBe(0);
  });
});

describe('mid-combat roster changes', () => {
  const running = () =>
    startCombat(stageCombat({ ...encounter, entries: [{ templateId: goblin.id, count: 2 }] }, templates), [
      { player: makePlayer({ name: 'Aria' }), initiative: 15 },
    ], dieRng([10, 20]));

  it('reinforcements get the next number and keep the current turn', () => {
    let c = running();
    const currentId = c.combatants[c.turnIndex]!.id;
    c = addCreature(c, goblin, { rng: dieRng([20, 20]) });
    expect(c.combatants.map((x) => x.tokenName)).toContain('Goblin 3');
    expect(c.combatants[c.turnIndex]!.id).toBe(currentId);
    expect(c.combatants[0]!.tokenName).toBe('Goblin 3'); // rolled 22, top of the order
  });

  it('players can join mid-combat', () => {
    let c = running();
    c = addPlayer(c, makePlayer({ name: 'Cass' }), 13);
    expect(c.combatants.map((x) => x.tokenName)).toEqual(['Aria', 'Cass', 'Goblin 1', 'Goblin 2']);
  });

  it('removing the current combatant passes the turn on', () => {
    let c = running(); // Aria, Goblin 1, Goblin 2
    c = nextTurn(c); // Goblin 1
    c = removeCombatant(c, c.combatants[1]!.id);
    expect(c.combatants[c.turnIndex]!.tokenName).toBe('Goblin 2');
    expect(c.round).toBe(1);
  });

  it('removing the last combatant on its turn wraps to the next round', () => {
    let c = nextTurn(nextTurn(running())); // Goblin 2
    c = removeCombatant(c, c.combatants[2]!.id);
    expect(c.combatants[c.turnIndex]!.tokenName).toBe('Aria');
    expect(c.round).toBe(2);
  });

  it('removing someone before the pointer keeps the current combatant', () => {
    let c = nextTurn(nextTurn(running())); // Goblin 2
    c = removeCombatant(c, c.combatants[0]!.id);
    expect(c.combatants[c.turnIndex]!.tokenName).toBe('Goblin 2');
  });
});
