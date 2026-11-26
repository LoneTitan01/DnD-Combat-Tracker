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

export const ITEM_CATEGORIES = ['weapon', 'armor', 'tool', 'gear'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const WEAPON_CLASSES = ['simple', 'martial'] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];
export const WEAPON_RANGES = ['melee', 'ranged'] as const;
export type WeaponRange = (typeof WEAPON_RANGES)[number];

export interface WeaponDetails {
  class: WeaponClass;
  range: WeaponRange;
  /** Dice expression such as "1d8", or "1" for a blowgun. Blank for a net. */
  damage: string;
  damageType: DamageType;
  /** Free text: "Finesse, light, thrown (range 20/60)". */
  properties: string;
}

export const ARMOR_TYPES = ['light', 'medium', 'heavy', 'shield'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

export interface ArmorDetails {
  type: ArmorType;
  /** Free text: "11 + Dex modifier", "+2". */
  ac: string;
  /** Strength score needed to wear it without a speed penalty. 0 = none. */
  strength: number;
  stealthDisadvantage: boolean;
}

export const TOOL_TYPES = ['artisan', 'gaming', 'musical', 'other'] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

export interface ToolDetails {
  type: ToolType;
}

export const ITEM_RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

/** A spell the item lets its wielder cast, an action they can take with it, or something it always does. */
export const MAGIC_EFFECT_KINDS = ['spell', 'action', 'passive'] as const;
export type MagicEffectKind = (typeof MAGIC_EFFECT_KINDS)[number];

export interface MagicEffect {
  id: ID;
  kind: MagicEffectKind;
  /** The action's or passive's name. For a spell, blank = the linked spell's name. */
  name: string;
  /** For a spell: the spell from the spell list it casts. */
  spellId?: ID;
  /** What it does: a save DC, damage, how long it lasts. */
  description: string;
  /** Uses (charges) before it recharges. 0 = unlimited. Passives don't use it. */
  uses: number;
  /** Free text: "dawn", "long rest". Blank = it doesn't recharge. */
  recharge: string;
}

export interface MagicDetails {
  rarity: ItemRarity;
  attunement: boolean;
  /** Who can attune to it, printed after "requires attunement": "by a wizard". */
  attunementBy: string;
  /** The +N enchantment: weapons add it to attack and damage rolls, armor and shields to AC. 0 = none. */
  bonus: number;
  effects: MagicEffect[];
}

/**
 * An item in the item list, shared by all campaigns like the bestiary and the spell list. Every item
 * belongs to one of four categories. Details for the other categories are kept when the category
 * changes, so switching back in the editor loses nothing.
 */
export interface Item {
  id: ID;
  name: string;
  category: ItemCategory;
  /** Free text: "15 gp", "5 sp". */
  cost: string;
  /** Free text: "3 lb.". */
  weight: string;
  description: string;
  weapon?: WeaponDetails;
  armor?: ArmorDetails;
  tool?: ToolDetails;
  /** Present on magic items only. */
  magic?: MagicDetails;
  createdAt: number;
  updatedAt: number;
}

/** An umbrella for one group's players, locations, NPCs, encounters and combats. The bestiary is shared by all campaigns. */
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
  /** What's for sale here, in the DM's order. Missing when the place has no shop. */
  shop?: ShopItem[];
  createdAt: number;
  updatedAt: number;
}

/**
 * One line of a location's shop table. Cost is free text ("50 gp", "a favour"); it starts as the
 * item's list price and can be changed per shop.
 */
export interface ShopItem {
  id: ID;
  /** The item from the item list. Missing on rows typed in before shops used the item list. */
  itemId?: ID;
  /** The item's name when it was added, shown if the item is later deleted from the item list. */
  name: string;
  cost: string;
  description: string;
  /** How many are on the shelf now. Missing when the shop doesn't count them. */
  stock?: number;
  /** How many a restock fills the shelf back up to. Missing when the item isn't restocked. */
  maxStock?: number;
}

/** A non-player character in one campaign. */
export interface Npc {
  id: ID;
  campaignId: ID;
  name: string;
  /** The location the NPC lives in. Unset when it's unknown. */
  locationId?: ID;
  /** DM notes: who they are, what they want, what they know. Missing on NPCs saved before notes existed. */
  notes?: string;
  /** The organizations the NPC belongs to. Missing when they belong to none. */
  organizationIds?: ID[];
  /** Set on every save; used by sync to pick the newest copy. */
  updatedAt?: number;
}

/** A group NPCs can belong to in one campaign: a guild, a cult, a noble house. Members are listed on the NPCs. */
export interface Organization {
  id: ID;
  campaignId: ID;
  name: string;
  description: string;
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

/** What the player view shows as a creature's kind: nothing, its real stat block name, or the DM's fake. */
export type CreatureShown = 'hidden' | 'real' | 'fake';

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
  /** What the player view shows as the kind of creature while `creatureShown` is 'fake'. Blank = nothing shown. */
  fakeName?: string;
  /** What kind of creature the player view shows. Missing = hidden (the default). */
  creatureShown?: CreatureShown;
  /** @deprecated Older combats: true meant 'fake'. Read through `creatureShownOf`. */
  showFakeName?: boolean;
  /** A creature fighting on the players' side. Its name shows green instead of red to players. */
  ally?: boolean;
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

export const SYNC_TABLES = ['campaigns', 'creatures', 'spells', 'items', 'players', 'locations', 'npcs', 'organizations', 'encounters', 'combats'] as const;
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
  items: Item[];
  players: Player[];
  locations: Location[];
  npcs: Npc[];
  organizations: Organization[];
  encounters: Encounter[];
  combats: Combat[];
  deletions: Tombstone[];
}

/** Keyboard shortcuts as shared through sync: action id → key, stamped like a record. */
export interface SyncedHotkeys {
  keys: Record<string, string>;
  /** When they were last changed on some device; 0 = never changed (the defaults). */
  updatedAt: number;
}

/** The file kept in the user's Google Drive (app data folder). */
export interface SyncFile extends SyncData {
  app: 'dm-combat-tracker';
  format: 1;
  savedAt: number;
  /** Only present once a device with shortcut sync turned on has synced. */
  hotkeys?: SyncedHotkeys;
}
