// Core data model. Templates (bestiary) vs. instances (combatants) is the key split:
// a CreatureTemplate is defined once; each creature in a Combat is a Combatant
// with its own token name, HP and ability recharge state.

export type ID = string;

export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const;
export type Size = (typeof SIZES)[number];

export const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const;
export type DieType = (typeof DIE_TYPES)[number];

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

export interface HitDice {
  count: number;
  dieType: DieType;
  bonus: number;
}

/** CR is stored as a string so fractions ("1/8", "1/4", "1/2") stay exact. */
export type ChallengeRating = string;

export type RechargeMode = 'fixed' | 'rolled' | 'threshold';

export interface Recharge {
  mode: RechargeMode;
  /** fixed: number of the monster's own turns before it is ready again */
  turns?: number;
  /** rolled: dice expression such as "1d6" or "1d4+1" */
  dice?: string;
  /** threshold: lowest d6 result that recharges it (5 = "Recharge 5–6") */
  minRoll?: number;
}

export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Whether a timed condition runs out at the start or the end of a turn. */
export type ConditionTiming = 'start' | 'end';

export interface ActiveCondition {
  name: Condition;
  /** Turns left, counted on the anchor's turns. Absent = lasts until removed. */
  rounds?: number;
  /** Default 'end': "until the end of its next turn". */
  ends?: ConditionTiming;
  /** Whose turns count. Absent (or no longer in the combat) = the affected combatant's own turns. */
  anchorId?: ID;
  /**
   * End-timed durations applied during the anchor's own turn don't count that turn; they arm at its
   * end and start ticking from the next one.
   */
  armed?: boolean;
}

export const ACTION_KINDS =['action', 'bonus', 'reaction', 'legendary'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface Action {
  id: ID;
  name: string;
  description: string;
  kind: ActionKind;
  recharge?: Recharge;
}

export interface Trait {
  id: ID;
  name: string;
  description: string;
}

export interface CreatureTemplate {
  id: ID;
  name: string;
  size: Size;
  type: string;
  alignment: string;
  ac: number;
  acNote?: string;
  maxHP: number;
  hitDice: HitDice;
  speed: string;
  abilities: AbilityScores;
  saves: string;
  skills: string;
  damageResistances: DamageType[];
  damageVulnerabilities: DamageType[];
  damageImmunities: DamageType[];
  conditionImmunities: string[];
  senses: string;
  languages: string;
  cr: ChallengeRating;
  xp: number;
  traits: Trait[];
  /** Actions, bonus actions, reactions and legendary actions, distinguished by `kind`. */
  actions: Action[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Player {
  id: ID;
  name: string;
  level?: number;
  passivePerception?: number;
  initiativeBonus: number;
}

export interface EncounterEntry {
  templateId: ID;
  count: number;
}

export interface Encounter {
  id: ID;
  name: string;
  description: string;
  entries: EncounterEntry[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type CombatStatus = 'staged' | 'active' | 'ended';

export type AbilityStatus = 'ready' | 'rollNeeded' | 'counting' | 'thresholdRoll';

export interface AbilityState {
  actionId: ID;
  status: AbilityStatus;
  /** counting: turns left; ready at the start of the monster's next turn after it reaches 0 */
  turnsRemaining?: number;
  /**
   * counting: whether the countdown is live. A fixed-mode use arms on the monster's next turn,
   * so the turn the ability was used never counts.
   */
  armed?: boolean;
  /** rollNeeded / thresholdRoll: show the roll banner on this turn. Set at turn start, cleared on resolve, dismiss or turn end. */
  promptPending?: boolean;
  /** Became ready at the start of the current turn; drives the "X is ready" notice. Cleared at turn end. */
  justReady?: boolean;
}

export type CombatantKind = 'creature' | 'player';

export interface Combatant {
  id: ID;
  kind: CombatantKind;
  templateId?: ID;
  playerId?: ID;
  tokenName: string;
  initiative: number | null;
  /** Initiative modifier used when rolling (DEX mod for creatures, initiativeBonus for players). */
  initiativeBonus: number;
  /** Tie-breaker: DEX score for creatures. Players have none (they sort after equal-DEX creatures by manual order). */
  dexScore?: number;
  /** Players track their own HP; these are only meaningful for creatures. */
  currentHP: number;
  tempHP: number;
  maxHP: number;
  isDead: boolean;
  conditions: ActiveCondition[];
  /** XP awarded when this creature dies. Snapshot of the template so later edits don't change the tally. */
  xp: number;
  abilityStates: AbilityState[];
}

export type DamageModifier = 'normal' | 'resisted' | 'vulnerable' | 'immune';

export type LogEntryType =
  | 'damage'
  | 'heal'
  | 'tempHP'
  | 'abilityUsed'
  | 'rechargeRolled'
  | 'abilityReady'
  | 'conditionEnded';

export interface LogEntry {
  id: ID;
  type: LogEntryType;
  round: number;
  combatantId: ID;
  at: number;
  // damage / heal
  rawDamage?: number;
  modifier?: DamageModifier;
  damageType?: DamageType;
  appliedDamage?: number;
  hpAfter?: number;
  // ability events
  actionId?: ID;
  roll?: number;
  // condition events
  condition?: Condition;
  /** Combatant state before this event, for undo. Absent on entries that can't be undone. */
  before?: Combatant;
}

export interface Combat {
  id: ID;
  encounterId: ID;
  name: string;
  round: number;
  /** Index into `combatants`, which is always kept in turn order. */
  turnIndex: number;
  combatants: Combatant[];
  log: LogEntry[];
  status: CombatStatus;
  createdAt: number;
  updatedAt: number;
}
