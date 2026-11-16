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

/** Bludgeoning, piercing and slashing: the types "nonmagical weapons" resistance covers. */
export const WEAPON_DAMAGE_TYPES: readonly DamageType[] = ['bludgeoning', 'piercing', 'slashing'];

/** Resistance or immunity to bludgeoning, piercing and slashing from nonmagical weapons or sources. */
export const NONMAGICAL = 'nonmagical';
export const DEFENSE_TYPES = [...DAMAGE_TYPES, NONMAGICAL] as const;
export type DefenseType = (typeof DEFENSE_TYPES)[number];

/** How a resistance or immunity reads in a stat block. */
export function defenseLabel(r: DefenseType): string {
  return r === NONMAGICAL ? 'bludgeoning, piercing, and slashing from nonmagical attacks' : r;
}

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

/** What each condition does (2014 rules), shown on hover. */
export const CONDITION_DESCRIPTIONS: Record<Condition, string> = {
  blinded:
    "Can't see; automatically fails checks that require sight.\nAttack rolls against it have advantage; its attack rolls have disadvantage.",
  charmed:
    "Can't attack the charmer or target it with harmful abilities or magic.\nThe charmer has advantage on ability checks to interact socially with it.",
  deafened: "Can't hear; automatically fails checks that require hearing.",
  exhaustion:
    'Cumulative levels:\n1: Disadvantage on ability checks\n2: Speed halved\n3: Disadvantage on attack rolls and saving throws\n4: Hit point maximum halved\n5: Speed reduced to 0\n6: Death\nA long rest (with food and drink) removes one level.',
  frightened:
    "Disadvantage on ability checks and attack rolls while the source of its fear is in sight.\nCan't willingly move closer to the source.",
  grappled:
    "Speed becomes 0 and can't benefit from bonuses to speed.\nEnds if the grappler is incapacitated, or if an effect moves it out of the grappler's reach.",
  incapacitated: "Can't take actions or reactions.",
  invisible:
    "Impossible to see without magic or a special sense; counts as heavily obscured for hiding.\nAttack rolls against it have disadvantage; its attack rolls have advantage.",
  paralyzed:
    "Incapacitated; can't move or speak.\nAutomatically fails Strength and Dexterity saves.\nAttack rolls against it have advantage; any hit from within 5 ft is a critical hit.",
  petrified:
    "Turned to solid substance; weight ×10 and stops aging.\nIncapacitated; can't move or speak; unaware of its surroundings.\nAttack rolls against it have advantage; automatically fails Strength and Dexterity saves.\nResistance to all damage; immune to poison and disease (existing ones are suspended).",
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone:
    "Can only crawl unless it stands up (costs half its speed).\nDisadvantage on its attack rolls.\nAttacks against it have advantage within 5 ft, disadvantage from farther away.",
  restrained:
    'Speed becomes 0 and can\'t benefit from bonuses to speed.\nAttack rolls against it have advantage; its attack rolls have disadvantage.\nDisadvantage on Dexterity saves.',
  stunned:
    "Incapacitated; can't move; can speak only falteringly.\nAutomatically fails Strength and Dexterity saves.\nAttack rolls against it have advantage.",
  unconscious:
    "Incapacitated; can't move or speak; unaware of its surroundings. Drops what it's holding and falls prone.\nAutomatically fails Strength and Dexterity saves.\nAttack rolls against it have advantage; any hit from within 5 ft is a critical hit.",
};

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

export const REST_TYPES = ['short', 'long'] as const;
/** What restores a limited-use spell: a short rest (or a long one) or only a long rest. */
export type RestType = (typeof REST_TYPES)[number];

/** A linked spell the creature can cast only so many times before it rests. */
export interface SpellUsage {
  /** Casts allowed per rest (at least 1). */
  uses: number;
  per: RestType;
}

export const SPELL_RESOURCES = ['perSpell', 'slots'] as const;
/** How a creature pays for its spells: so many casts of specific spells, or spell slots by level. */
export type SpellResource = (typeof SPELL_RESOURCES)[number];

/** Highest spell-slot level. */
export const MAX_SLOT_LEVEL = 9;

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
  damageResistances: DefenseType[];
  damageVulnerabilities: DamageType[];
  damageImmunities: DefenseType[];
  conditionImmunities: string[];
  senses: string;
  languages: string;
  cr: ChallengeRating;
  xp: number;
  traits: Trait[];
  /** Actions, bonus actions, reactions and legendary actions, distinguished by `kind`. */
  actions: Action[];
  notes: string;
  /** Spells from the spell list this creature can cast. Missing on stat blocks saved before spells existed. */
  spellIds?: ID[];
  /** Limits on linked spells, by spell id. Spells without an entry are at will. */
  spellUsage?: Record<ID, SpellUsage>;
  /** Absent = 'perSpell' (limits in `spellUsage`). With 'slots', `spellSlots` is tracked in combat instead. */
  spellResource?: SpellResource;
  /** Spell slots by level: index 0 is 1st level, up to 9th. Kept when switching back to per-spell uses. */
  spellSlots?: number[];
  createdAt: number;
  updatedAt: number;
}

export const SPELL_SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const;

/** A spell in the spell list, shared by all campaigns like the bestiary. Linked to stat blocks by id. */
export interface Spell {
  id: ID;
  name: string;
  /** 0 = cantrip, 1–9 = spell level. */
  level: number;
  /** Usually one of SPELL_SCHOOLS; free text so homebrew schools work. */
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  /** "At Higher Levels" text. */
  higherLevels: string;
  createdAt: number;
  updatedAt: number;
}

/** An umbrella for one group's players, locations, encounters and combats. The bestiary is shared by all campaigns. */
export interface Campaign {
  id: ID;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

/** The campaign that records saved before campaigns existed belong to. */
export const DEFAULT_CAMPAIGN_ID = 'default';

export interface Player {
  id: ID;
  /** Missing on players saved before campaigns existed: they belong to the default campaign. */
  campaignId?: ID;
  name: string;
  level?: number;
  passivePerception?: number;
  initiativeBonus: number;
  /** Set on every save; used by sync to pick the newest copy. Missing on players saved before sync existed. */
  updatedAt?: number;
}

/**
 * A place in one campaign: a town, a shop in it, a dungeon room. Places nest through `parentId`, so a
 * location's children are the locations whose parent it is (not stored on the location itself).
 */
export interface Location {
  id: ID;
  campaignId: ID;
  name: string;
  /** The place this one is inside of. */
  parentId?: ID;
  /**
   * Places linked as neighbours (a nearby town, the shop next door). Kept on both locations. Places
   * that share a parent are siblings too, without being listed here.
   */
  siblingIds: ID[];
  notes: string;
  /** Names of the NPCs found here. */
  npcs: string[];
  createdAt: number;
  updatedAt: number;
}

export interface EncounterEntry {
  templateId: ID;
  count: number;
}

export interface Encounter {
  id: ID;
  /** Missing on encounters saved before campaigns existed: they belong to the default campaign. */
  campaignId?: ID;
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
  /** DM-only notes for this combatant in this combat (tactics, grudges, what it's carrying). Never shown on the table view. */
  notes?: string;
  /** What kind of creature this is: its stat block's name (e.g. "Boar"), snapshotted when added. Missing on older combats. */
  creatureName?: string;
  /** What the player view shows as the kind of creature while `showFakeName` is on. Blank = nothing shown. */
  fakeName?: string;
  /** Player view shows `fakeName` instead of the real kind of creature. */
  showFakeName?: boolean;
  /** Casts spent on limited-use spells in this combat, by spell id. The limits come from the stat block. */
  spellsUsed?: Record<ID, number>;
  /** Spell slots spent in this combat, by slot level (1–9). The slot counts come from the stat block. */
  slotsUsed?: Record<number, number>;
}

export type DamageModifier = 'normal' | 'resisted' | 'vulnerable' | 'immune';

export type LogEntryType =
  | 'damage'
  | 'heal'
  | 'tempHP'
  | 'abilityUsed'
  | 'rechargeRolled'
  | 'abilityReady'
  | 'conditionEnded'
  | 'spellCast'
  | 'spellUsesAdjusted'
  | 'slotUsed'
  | 'slotRestored';

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
  // spell events: the spell, and how many of its uses are spent afterwards
  spellId?: ID;
  usesAfter?: number;
  // slot events: the slot level (with `usesAfter` as slots spent afterwards)
  slotLevel?: number;
  // condition events
  condition?: Condition;
  /** Combatant state before this event, for undo. Absent on entries that can't be undone. */
  before?: Combatant;
}

export interface Combat {
  id: ID;
  encounterId: ID;
  /** Copied from the encounter when staged. Missing on older combats: they belong to the default campaign. */
  campaignId?: ID;
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

// ---------- sync ----------

export const SYNC_TABLES = ['campaigns', 'creatures', 'spells', 'players', 'locations', 'encounters', 'combats'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** A record deleted on some device, so other devices delete it too instead of bringing it back. */
export interface Tombstone {
  table: SyncTable;
  id: ID;
  deletedAt: number;
}

export interface SyncData {
  campaigns: Campaign[];
  creatures: CreatureTemplate[];
  spells: Spell[];
  players: Player[];
  locations: Location[];
  encounters: Encounter[];
  combats: Combat[];
  deletions: Tombstone[];
}

/** The file kept in the user's Google Drive (app data folder). */
export interface SyncFile extends SyncData {
  app: 'dm-combat-tracker';
  format: 1;
  savedAt: number;
}
