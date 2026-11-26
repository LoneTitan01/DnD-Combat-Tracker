import { CONDITIONS, type ActiveCondition, type Combat, type CombatantKind, type Condition, type ID } from '../models';
import { removeCondition, setCondition } from './conditions';
import { defaultRng, type Rng } from './dice';
import { changeInitiative } from './staging';
import { isAlly, shownCreature, tableView, type TableView, type TemplateNames } from './table';

/*
 * Players' own devices ⇄ the DM's combat screen, over a peer-to-peer link. The DM's screen is the
 * only source of truth: it sends each player device a pre-computed view (no HP, stats, notes or
 * creature conditions), and players send back small actions that it checks before applying.
 */

/** Unambiguous letters and digits: no 0/O, 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export function makeJoinCode(rng: Rng = defaultRng): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

/** Tidies a typed code ("abc-23x" → "ABC23X"); null if it can't be one. */
export function normalizeJoinCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (code.length !== JOIN_CODE_LENGTH) return null;
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}

/** The DM's address on the signalling server. Prefixed so codes don't collide with other apps. */
export function hostPeerId(code: string): string {
  return `dm-combat-tracker-${code}`;
}

export interface RemoteTurn {
  id: ID;
  name: string;
  kind: CombatantKind;
  /** A creature on the players' side. */
  ally: boolean;
  /** The kind of creature players see (real or the DM's fake), or null. */
  creature: string | null;
  current: boolean;
}

export interface RemotePlayer {
  id: ID;
  name: string;
  initiative: number | null;
  conditions: ActiveCondition[];
}

export interface RemoteView {
  combatId: ID;
  name: string;
  round: number;
  table: TableView;
  /** Living combatants in turn order, starting from the top of the round. Empty unless active. */
  order: RemoteTurn[];
  /** The player characters in the combat, which player devices can claim and edit. */
  players: RemotePlayer[];
}

export function remoteView(combat: Combat, templates?: TemplateNames): RemoteView {
  const active = combat.status === 'active';
  return {
    combatId: combat.id,
    name: combat.name,
    round: combat.round,
    table: tableView(combat, templates),
    order: active
      ? combat.combatants
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => !c.isDead)
          .map(({ c, i }) => ({
            id: c.id,
            name: c.tokenName,
            kind: c.kind,
            ally: isAlly(c),
            creature: shownCreature(c, templates),
            current: i === combat.turnIndex,
          }))
      : [],
    players: combat.combatants
      .filter((c) => c.kind === 'player')
      .map((c) => ({ id: c.id, name: c.tokenName, initiative: c.initiative, conditions: c.conditions })),
  };
}

/** What a player device may change: its own character's initiative and conditions. */
export type PlayerAction =
  | { type: 'setInitiative'; combatantId: ID; initiative: number | null }
  | { type: 'setCondition'; combatantId: ID; condition: Condition; on: boolean };

export type PlayerMessage = { type: 'hello' } | { type: 'action'; action: PlayerAction };
export type HostMessage = { type: 'view'; view: RemoteView } | { type: 'closed' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Anything can arrive over the wire; this keeps only well-formed player messages. */
export function parsePlayerMessage(data: unknown): PlayerMessage | null {
  if (!isObj(data)) return null;
  if (data.type === 'hello') return { type: 'hello' };
  if (data.type !== 'action' || !isObj(data.action)) return null;
  const a = data.action;
  if (typeof a.combatantId !== 'string') return null;
  if (a.type === 'setInitiative') {
    const n = a.initiative;
    if (n !== null && !(typeof n === 'number' && Number.isInteger(n) && n >= -20 && n <= 99)) return null;
    return { type: 'action', action: { type: 'setInitiative', combatantId: a.combatantId, initiative: n } };
  }
  if (a.type === 'setCondition') {
    if (typeof a.on !== 'boolean' || !(CONDITIONS as readonly unknown[]).includes(a.condition)) return null;
    return {
      type: 'action',
      action: { type: 'setCondition', combatantId: a.combatantId, condition: a.condition as Condition, on: a.on },
    };
  }
  return null;
}

/** Applies a player's change, only to a player character and only while the combat isn't over. */
export function applyPlayerAction(combat: Combat, action: PlayerAction): Combat {
  if (combat.status === 'ended') return combat;
  const target = combat.combatants.find((c) => c.id === action.combatantId);
  if (!target || target.kind !== 'player') return combat;
  switch (action.type) {
    case 'setInitiative':
      return target.initiative === action.initiative ? combat : changeInitiative(combat, target.id, action.initiative);
    case 'setCondition': {
      const has = target.conditions.some((x) => x.name === action.condition);
      if (has === action.on) return combat; // keeps any duration the DM set
      return action.on ? setCondition(combat, target.id, action.condition) : removeCondition(combat, target.id, action.condition);
    }
  }
}
