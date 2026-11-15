import type { Combat, Combatant, CreatureTemplate, Player } from '../models';
import type { Rng } from './dice';

let seq = 0;

/** Rng that returns a fixed sequence of d-values. `seqRng(20, 6)` → a d20 rolls 20, a d6 rolls 6. */
export function dieRng(...faces: Array<[face: number, sides: number]>): Rng {
  let i = 0;
  return () => {
    const [face, sides] = faces[i++ % faces.length]!;
    return (face - 1) / sides + 1e-9;
  };
}

export function makeTemplate(overrides: Partial<CreatureTemplate> = {}): CreatureTemplate {
  return {
    id: `tpl-${++seq}`,
    name: 'Goblin',
    size: 'Small',
    type: 'humanoid',
    alignment: 'neutral evil',
    ac: 15,
    maxHP: 7,
    hitDice: { count: 2, dieType: 'd6', bonus: 0 },
    speed: '30 ft.',
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    saves: '',
    skills: '',
    damageResistances: [],
    damageVulnerabilities: [],
    damageImmunities: [],
    conditionImmunities: [],
    senses: '',
    languages: '',
    cr: '1/4',
    xp: 50,
    traits: [],
    actions: [],
    notes: '',
    spellIds: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<Player> = {}): Player {
  return { id: `pl-${++seq}`, name: 'Aria', level: 3, initiativeBonus: 2, ...overrides };
}

export function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: `c-${++seq}`,
    kind: 'creature',
    tokenName: 'Goblin 1',
    initiative: 10,
    initiativeBonus: 2,
    dexScore: 14,
    currentHP: 7,
    tempHP: 0,
    maxHP: 7,
    isDead: false,
    conditions: [],
    xp: 50,
    abilityStates: [],
    ...overrides,
  };
}

export function makeCombat(combatants: Combatant[], overrides: Partial<Combat> = {}): Combat {
  return {
    id: `cb-${++seq}`,
    encounterId: 'enc',
    name: 'Test',
    round: 1,
    turnIndex: 0,
    combatants,
    log: [],
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}
