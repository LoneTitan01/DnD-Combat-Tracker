import type { Combat, Combatant, CreatureTemplate, Encounter, ID, Player } from '../models';
import { initialAbilityStates } from './combat';
import { abilityMod, averageHP, defaultRng, rollHP, type Rng } from './dice';
import { rollInitiative, sortInitiative, withCombatants } from './initiative';
import { beginCombat, findNextIndex, startTurn } from './turns';
import { newId } from './ids';

export type HPMode = 'average' | 'rolled';

export interface CreatureOptions {
  hpMode?: HPMode;
  rollInitiative?: boolean;
  rng?: Rng;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Next free "Name N" given existing token names. A bare "Name" counts as 1. */
export function nextTokenName(base: string, existing: readonly string[]): string {
  const re = new RegExp(`^${escapeRe(base)}(?: (\\d+))?$`, 'i');
  let max = 0;
  for (const name of existing) {
    const m = re.exec(name.trim());
    if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1);
  }
  return `${base} ${max + 1}`;
}

/** Token names used more than once (case-insensitive). The UI warns on these. */
export function duplicateTokenNames(combat: Combat): Set<string> {
  const seen = new Map<string, number>();
  for (const c of combat.combatants) {
    const k = c.tokenName.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

export function createCreatureCombatant(
  template: CreatureTemplate,
  tokenName: string,
  opts: CreatureOptions = {},
): Combatant {
  const rng = opts.rng ?? defaultRng;
  const maxHP = opts.hpMode === 'rolled' ? rollHP(template.hitDice, rng) : template.maxHP || averageHP(template.hitDice);
  const c: Combatant = {
    id: newId(),
    kind: 'creature',
    templateId: template.id,
    tokenName,
    initiative: null,
    initiativeBonus: abilityMod(template.abilities.dex),
    dexScore: template.abilities.dex,
    currentHP: maxHP,
    tempHP: 0,
    maxHP,
    isDead: false,
    conditions: [],
    xp: template.xp,
    abilityStates: initialAbilityStates(template.actions),
  };
  if (opts.rollInitiative) c.initiative = rollInitiative(c, rng);
  return c;
}

export function createPlayerCombatant(player: Player, initiative: number | null): Combatant {
  return {
    id: newId(),
    kind: 'player',
    playerId: player.id,
    tokenName: player.name,
    initiative,
    initiativeBonus: player.initiativeBonus,
    currentHP: 0,
    tempHP: 0,
    maxHP: 0,
    isDead: false,
    conditions: [],
    xp: 0,
    abilityStates: [],
  };
}

/**
 * Turns a saved encounter into a staged combat: creatures only, one combatant per creature,
 * auto-numbered token names ("Goblin 1", "Goblin 2"). Missing templates are skipped.
 */
export function stageCombat(
  encounter: Encounter,
  templates: ReadonlyMap<ID, CreatureTemplate>,
  opts: CreatureOptions = {},
): Combat {
  const combatants: Combatant[] = [];
  for (const entry of encounter.entries) {
    const t = templates.get(entry.templateId);
    if (!t) continue;
    for (let i = 0; i < entry.count; i++) {
      const name = nextTokenName(t.name, combatants.map((c) => c.tokenName));
      combatants.push(createCreatureCombatant(t, name, opts));
    }
  }
  const now = Date.now();
  return {
    id: newId(),
    encounterId: encounter.id,
    name: encounter.name,
    round: 0,
    turnIndex: 0,
    combatants,
    log: [],
    status: 'staged',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Inserts a combatant into the running order without moving the turn pointer. Before combat starts
 * it's simply appended (sorting happens at start).
 */
function insertCombatant(combat: Combat, c: Combatant): Combat {
  if (combat.status !== 'active') return { ...combat, combatants: [...combat.combatants, c] };
  return withCombatants(combat, placeByInitiative(combat.combatants, c));
}

/**
 * Places `c` among `others` by initiative while keeping everyone else's relative order
 * (so manual drags survive).
 */
function placeByInitiative(others: readonly Combatant[], c: Combatant): Combatant[] {
  const sorted = sortInitiative([...others, c]);
  const pos = sorted.findIndex((x) => x.id === c.id);
  // The neighbour after `c` in sorted order tells us where to insert into the existing order.
  const after = sorted[pos + 1];
  const list = [...others];
  const at = after ? list.findIndex((x) => x.id === after.id) : list.length;
  list.splice(at < 0 ? list.length : at, 0, c);
  return list;
}

/**
 * Edits a combatant's initiative. In an active combat it moves to its new place in the order,
 * nobody else moves, and the turn pointer stays on whoever's turn it is.
 */
export function changeInitiative(combat: Combat, id: ID, initiative: number | null): Combat {
  const c = combat.combatants.find((x) => x.id === id);
  if (!c) return combat;
  const updated = { ...c, initiative };
  if (combat.status !== 'active') return setInitiative(combat, id, initiative);
  return withCombatants(combat, placeByInitiative(combat.combatants.filter((x) => x.id !== id), updated));
}

/** Staging: sets a creature's max HP (and current HP to match). */
export function setCreatureHP(combat: Combat, id: ID, hp: number): Combat {
  const value = Math.max(1, Math.floor(hp));
  return {
    ...combat,
    combatants: combat.combatants.map((c) =>
      c.id === id && c.kind === 'creature' ? { ...c, maxHP: value, currentHP: value, tempHP: 0, isDead: false } : c,
    ),
  };
}

/** Staging: average or rolled HP from the stat block's hit dice. */
export function resetCreatureHP(
  combat: Combat,
  id: ID,
  template: CreatureTemplate,
  mode: HPMode,
  rng: Rng = defaultRng,
): Combat {
  const hp = mode === 'rolled' ? rollHP(template.hitDice, rng) : template.maxHP || averageHP(template.hitDice);
  return setCreatureHP(combat, id, hp);
}

/** Adds a reinforcement with the next token number. In an active combat its initiative is rolled. */
export function addCreature(combat: Combat, template: CreatureTemplate, opts: CreatureOptions = {}): Combat {
  const name = nextTokenName(template.name, combat.combatants.map((c) => c.tokenName));
  const c = createCreatureCombatant(template, name, {
    ...opts,
    rollInitiative: opts.rollInitiative ?? combat.status === 'active',
  });
  return insertCombatant(combat, c);
}

export function addPlayer(combat: Combat, player: Player, initiative: number | null): Combat {
  return insertCombatant(combat, createPlayerCombatant(player, initiative));
}

/** Removes a combatant. If it was the current one, the turn passes to the next living combatant. */
export function removeCombatant(combat: Combat, id: ID): Combat {
  const idx = combat.combatants.findIndex((c) => c.id === id);
  if (idx < 0) return combat;
  const wasCurrent = combat.status === 'active' && idx === combat.turnIndex;
  const combatants = combat.combatants.filter((c) => c.id !== id);
  if (!wasCurrent) {
    return withCombatants(combat, combatants);
  }
  if (combatants.length === 0) return { ...combat, combatants, turnIndex: 0 };
  // Step from the slot just before the removed one so the next living combatant becomes current.
  const next = findNextIndex(combatants, idx - 1 < 0 ? combatants.length - 1 : idx - 1);
  const wrapped = idx >= combatants.length || (next !== null && next.index < idx);
  return startTurn({
    ...combat,
    combatants,
    turnIndex: next?.index ?? 0,
    round: wrapped ? combat.round + 1 : combat.round,
  });
}

export function renameToken(combat: Combat, id: ID, tokenName: string): Combat {
  return {
    ...combat,
    combatants: combat.combatants.map((c) => (c.id === id ? { ...c, tokenName } : c)),
  };
}

export function setInitiative(combat: Combat, id: ID, initiative: number | null): Combat {
  return {
    ...combat,
    combatants: combat.combatants.map((c) => (c.id === id ? { ...c, initiative } : c)),
  };
}

/** Rolls initiative for every creature that doesn't have one yet. */
export function rollMissingCreatureInitiative(combat: Combat, rng: Rng = defaultRng): Combat {
  return {
    ...combat,
    combatants: combat.combatants.map((c) =>
      c.kind === 'creature' && c.initiative === null ? { ...c, initiative: rollInitiative(c, rng) } : c,
    ),
  };
}

export interface AttendingPlayer {
  player: Player;
  initiative: number;
}

/** Start combat: add the players present with their initiative, roll any missing creature initiative, begin round 1. */
export function startCombat(combat: Combat, players: readonly AttendingPlayer[], rng: Rng = defaultRng): Combat {
  if (combat.status !== 'staged') return combat;
  const withPlayers = players.reduce((acc, p) => addPlayer(acc, p.player, p.initiative), combat);
  return beginCombat(rollMissingCreatureInitiative(withPlayers, rng));
}
