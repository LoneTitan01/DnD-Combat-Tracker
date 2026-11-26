import type { AbilityState, Combat, Combatant, CreatureShown, DamageModifier, DamageType, ID, LogEntry, Recharge } from '../models';
import { applyDamage, grantTempHP, heal, revive } from './damage';
import { defaultRng, rollDie, type Rng } from './dice';
import { newId } from './ids';
import { slotLevelLabel } from './spells';
import { creatureShownOf } from './table';

// ---------- helpers ----------

export function findCombatant(combat: Combat, id: ID): Combatant | undefined {
  return combat.combatants.find((c) => c.id === id);
}

export function updateCombatant(combat: Combat, id: ID, fn: (c: Combatant) => Combatant): Combat {
  let changed = false;
  const combatants = combat.combatants.map((c) => {
    if (c.id !== id) return c;
    changed = true;
    return fn(c);
  });
  return changed ? { ...combat, combatants } : combat;
}

function pushLog(combat: Combat, entry: Omit<LogEntry, 'id' | 'round' | 'at'>): Combat {
  return {
    ...combat,
    log: [...combat.log, { id: newId(), round: combat.round, at: Date.now(), ...entry }],
  };
}

function updateAbility(
  combat: Combat,
  combatantId: ID,
  actionId: ID,
  fn: (s: AbilityState) => AbilityState,
): Combat {
  return updateCombatant(combat, combatantId, (c) => ({
    ...c,
    abilityStates: c.abilityStates.map((s) => (s.actionId === actionId ? fn(s) : s)),
  }));
}

// ---------- damage & healing ----------

export function damageCombatant(
  combat: Combat,
  id: ID,
  raw: number,
  modifier: DamageModifier,
  damageType?: DamageType | null,
): Combat {
  const before = findCombatant(combat, id);
  if (!before) return combat;
  const { combatant, applied } = applyDamage(before, raw, modifier);
  const next = updateCombatant(combat, id, () => combatant);
  return pushLog(next, {
    type: 'damage',
    combatantId: id,
    rawDamage: Math.max(0, Math.floor(raw)),
    modifier,
    ...(damageType ? { damageType } : {}),
    appliedDamage: applied,
    hpAfter: combatant.currentHP,
    before,
  });
}

/** Same raw damage to several combatants (e.g. fireball), each with its own modifier. */
export function damageMany(
  combat: Combat,
  raw: number,
  targets: ReadonlyArray<{ id: ID; modifier: DamageModifier }>,
  damageType?: DamageType | null,
): Combat {
  return targets.reduce((acc, t) => damageCombatant(acc, t.id, raw, t.modifier, damageType), combat);
}

export function healCombatant(combat: Combat, id: ID, amount: number): Combat {
  const before = findCombatant(combat, id);
  if (!before) return combat;
  const after = heal(before, amount);
  const next = updateCombatant(combat, id, () => after);
  return pushLog(next, {
    type: 'heal',
    combatantId: id,
    rawDamage: Math.max(0, Math.floor(amount)),
    appliedDamage: after.currentHP - before.currentHP,
    hpAfter: after.currentHP,
    before,
  });
}

/** Temp HP doesn't stack: the higher value is kept. Logged so it can be undone. */
export function tempHPCombatant(combat: Combat, id: ID, amount: number): Combat {
  const before = findCombatant(combat, id);
  if (!before) return combat;
  const after = grantTempHP(before, amount);
  if (after.tempHP === before.tempHP) return combat;
  const next = updateCombatant(combat, id, () => after);
  return pushLog(next, {
    type: 'tempHP',
    combatantId: id,
    rawDamage: Math.max(0, Math.floor(amount)),
    appliedDamage: after.tempHP - before.tempHP,
    hpAfter: after.currentHP,
    before,
  });
}

export function reviveCombatant(combat: Combat, id: ID, hp = 1): Combat {
  const before = findCombatant(combat, id);
  if (!before || !before.isDead) return combat;
  const after = revive(before, hp);
  const next = updateCombatant(combat, id, () => after);
  return pushLog(next, {
    type: 'heal',
    combatantId: id,
    rawDamage: after.currentHP,
    appliedDamage: after.currentHP - before.currentHP,
    hpAfter: after.currentHP,
    before,
  });
}

// ---------- recharging abilities ----------

/** Fresh ability states for a creature: every recharging action starts ready. */
export function initialAbilityStates(actions: ReadonlyArray<{ id: ID; recharge?: Recharge }>): AbilityState[] {
  return actions.filter((a) => a.recharge).map((a) => ({ actionId: a.id, status: 'ready' as const }));
}

/** Marks a ready ability as used. The recharge rule comes from the template's action. */
export function useAbility(combat: Combat, combatantId: ID, actionId: ID, recharge: Recharge): Combat {
  const c = findCombatant(combat, combatantId);
  const state = c?.abilityStates.find((s) => s.actionId === actionId);
  if (!c || !state) return combat;

  const next = updateAbility(combat, combatantId, actionId, (): AbilityState => {
    switch (recharge.mode) {
      case 'fixed':
        return { actionId, status: 'counting', turnsRemaining: Math.max(0, recharge.turns ?? 1), armed: false };
      case 'rolled':
        return { actionId, status: 'rollNeeded' };
      case 'threshold':
        return { actionId, status: 'thresholdRoll' };
    }
  });
  return pushLog(next, { type: 'abilityUsed', combatantId, actionId, before: c });
}

/** Rolled mode: the DM enters (or rolls) the number of turns. The turn it's entered on counts. */
export function resolveRolledRecharge(combat: Combat, combatantId: ID, actionId: ID, turns: number): Combat {
  const c = findCombatant(combat, combatantId);
  if (!c) return combat;
  const t = Math.max(0, Math.floor(turns));
  const next = updateAbility(combat, combatantId, actionId, (): AbilityState =>
    t === 0
      ? { actionId, status: 'ready', justReady: true }
      : { actionId, status: 'counting', turnsRemaining: t, armed: true },
  );
  return pushLog(next, { type: 'rechargeRolled', combatantId, actionId, roll: t, before: c });
}

/** Recharge X–6: a d6 roll ≥ minRoll makes it ready immediately; otherwise ask again next turn. */
export function resolveThresholdRoll(
  combat: Combat,
  combatantId: ID,
  actionId: ID,
  roll: number,
  minRoll: number,
): Combat {
  const c = findCombatant(combat, combatantId);
  if (!c) return combat;
  const success = roll >= minRoll;
  const next = updateAbility(combat, combatantId, actionId, (s): AbilityState =>
    success ? { actionId, status: 'ready', justReady: true } : { ...s, promptPending: false },
  );
  return pushLog(next, { type: 'rechargeRolled', combatantId, actionId, roll, before: c });
}

export function rollD6(rng: Rng = defaultRng): number {
  return rollDie(6, rng);
}

/** Hides the roll banner until the monster's next turn. */
export function dismissPrompt(combat: Combat, combatantId: ID, actionId: ID): Combat {
  return updateAbility(combat, combatantId, actionId, (s) => ({ ...s, promptPending: false }));
}

/** DM override from the chip: mark ready or set the countdown by hand. */
export function setAbilityState(
  combat: Combat,
  combatantId: ID,
  actionId: ID,
  update: { ready: true } | { turnsRemaining: number },
): Combat {
  const c = findCombatant(combat, combatantId);
  if (!c) return combat;
  const next = updateAbility(combat, combatantId, actionId, (): AbilityState =>
    'ready' in update
      ? { actionId, status: 'ready' }
      : { actionId, status: 'counting', turnsRemaining: Math.max(0, update.turnsRemaining), armed: true },
  );
  return pushLog(next, { type: 'rechargeRolled', combatantId, actionId, before: c });
}

export interface AbilityPrompt {
  combatantId: ID;
  actionId: ID;
  kind: 'rolled' | 'threshold';
}

export function pendingPrompts(c: Combatant): AbilityPrompt[] {
  return c.abilityStates
    .filter((s) => s.promptPending && (s.status === 'rollNeeded' || s.status === 'thresholdRoll'))
    .map((s) => ({
      combatantId: c.id,
      actionId: s.actionId,
      kind: s.status === 'rollNeeded' ? 'rolled' : 'threshold',
    }));
}

// ---------- limited-use spells ----------

/** Casts of a spell spent in this combat. */
export function spellUsesSpent(c: Pick<Combatant, 'spellsUsed'>, spellId: ID): number {
  return c.spellsUsed?.[spellId] ?? 0;
}

/**
 * Spends (+1, a cast) or gives back (−1, a mistake or retcon) uses of a limited spell, kept between
 * 0 and `max` (the stat block's uses). Logged so it can be undone; no change, no log.
 */
export function changeSpellUses(combat: Combat, combatantId: ID, spellId: ID, delta: number, max: number): Combat {
  const c = findCombatant(combat, combatantId);
  if (!c) return combat;
  const spent = spellUsesSpent(c, spellId);
  const after = Math.min(Math.max(0, max), Math.max(0, spent + Math.trunc(delta)));
  if (after === spent) return combat;
  const next = updateCombatant(combat, combatantId, (x) => {
    const { [spellId]: _old, ...rest } = x.spellsUsed ?? {};
    return { ...x, spellsUsed: after > 0 ? { ...rest, [spellId]: after } : rest };
  });
  return pushLog(next, {
    type: after > spent ? 'spellCast' : 'spellUsesAdjusted',
    combatantId,
    spellId,
    usesAfter: after,
    before: c,
  });
}

// ---------- spell slots ----------

/** Slots of a level (1–9) spent in this combat. */
export function slotsSpent(c: Pick<Combatant, 'slotsUsed'>, level: number): number {
  return c.slotsUsed?.[level] ?? 0;
}

function withSlotsSpent(c: Combatant, level: number, n: number): Combatant {
  const { [level]: _old, ...rest } = c.slotsUsed ?? {};
  return { ...c, slotsUsed: n > 0 ? { ...rest, [level]: n } : rest };
}

/**
 * Spends (+1) or gives back (−1, a mistake or retcon) a spell slot of a level, kept between 0 and
 * `max` (the stat block's slots at that level). Logged so it can be undone; no change, no log.
 */
export function changeSlotUses(combat: Combat, combatantId: ID, level: number, delta: number, max: number): Combat {
  const c = findCombatant(combat, combatantId);
  if (!c) return combat;
  const spent = slotsSpent(c, level);
  const after = Math.min(Math.max(0, max), Math.max(0, spent + Math.trunc(delta)));
  if (after === spent) return combat;
  const next = updateCombatant(combat, combatantId, (x) => withSlotsSpent(x, level, after));
  return pushLog(next, {
    type: after > spent ? 'slotUsed' : 'slotRestored',
    combatantId,
    slotLevel: level,
    usesAfter: after,
    before: c,
  });
}

// ---------- notes ----------

/** Sets a combatant's DM notes. Not logged and not undoable; blank notes are removed. */
export function setCombatantNotes(combat: Combat, id: ID, notes: string): Combat {
  const c = findCombatant(combat, id);
  if (!c || (c.notes ?? '') === notes) return combat;
  return updateCombatant(combat, id, (x) => {
    const { notes: _old, ...rest } = x;
    return notes.trim() ? { ...rest, notes } : rest;
  });
}

/** Sets what kind of creature the player view shows: nothing, the real one (its stat block's name) or a fake. Not logged. */
export function setCreatureDisplay(
  combat: Combat,
  id: ID,
  change: { fakeName?: string; creatureShown?: CreatureShown },
): Combat {
  const c = findCombatant(combat, id);
  if (!c) return combat;
  if (
    (change.fakeName === undefined || change.fakeName === (c.fakeName ?? '')) &&
    (change.creatureShown === undefined || change.creatureShown === creatureShownOf(c))
  )
    return combat;
  return updateCombatant(combat, id, (x) => {
    const { showFakeName: _legacy, ...rest } = x;
    return { ...rest, creatureShown: creatureShownOf(x), ...change };
  });
}

/** Marks a creature as fighting on the players' side (or not). Not logged. */
export function setAlly(combat: Combat, id: ID, ally: boolean): Combat {
  const c = findCombatant(combat, id);
  if (!c || c.kind !== 'creature' || !!c.ally === ally) return combat;
  return updateCombatant(combat, id, (x) => {
    const { ally: _old, ...rest } = x;
    return ally ? { ...rest, ally: true } : rest;
  });
}

// ---------- undo ----------

const HP_TYPES = new Set(['damage', 'heal', 'tempHP']);
const SPELL_TYPES = new Set(['spellCast', 'spellUsesAdjusted']);
const SLOT_TYPES = new Set(['slotUsed', 'slotRestored']);

function isSlotEntry(e: LogEntry): boolean {
  return SLOT_TYPES.has(e.type);
}

function isHpEntry(e: LogEntry): boolean {
  return HP_TYPES.has(e.type);
}

function isSpellEntry(e: LogEntry): boolean {
  return SPELL_TYPES.has(e.type);
}

function sameUndoStream(a: LogEntry, b: LogEntry): boolean {
  if (a.combatantId !== b.combatantId || !a.before || !b.before) return false;
  if (isHpEntry(a)) return isHpEntry(b);
  if (isSpellEntry(a)) return isSpellEntry(b) && a.spellId === b.spellId;
  if (isSlotEntry(a)) return isSlotEntry(b) && a.slotLevel === b.slotLevel;
  return !isHpEntry(b) && !isSpellEntry(b) && !isSlotEntry(b) && a.actionId === b.actionId;
}

function restoreSpellUses(c: Combatant, before: Combatant, spellId: ID): Combatant {
  const { [spellId]: _now, ...rest } = c.spellsUsed ?? {};
  const was = spellUsesSpent(before, spellId);
  return { ...c, spellsUsed: was > 0 ? { ...rest, [spellId]: was } : rest };
}

/**
 * An entry can be undone when it has a snapshot and it is the latest undoable event in its stream:
 * HP events per combatant, ability events per combatant + ability. Undoing restores only that stream's
 * fields, so later turn ticks or damage on other combatants aren't rolled back.
 */
export function canUndo(combat: Combat, entryId: ID): boolean {
  const idx = combat.log.findIndex((e) => e.id === entryId);
  const entry = combat.log[idx];
  if (!entry?.before) return false;
  return !combat.log.slice(idx + 1).some((e) => sameUndoStream(entry, e));
}

export function undoLogEntry(combat: Combat, entryId: ID): Combat {
  if (!canUndo(combat, entryId)) return combat;
  const entry = combat.log.find((e) => e.id === entryId)!;
  const before = entry.before!;
  const restored = updateCombatant(combat, entry.combatantId, (c) =>
    isHpEntry(entry)
      ? { ...c, currentHP: before.currentHP, tempHP: before.tempHP, isDead: before.isDead }
      : isSpellEntry(entry)
        ? restoreSpellUses(c, before, entry.spellId!)
        : isSlotEntry(entry)
          ? withSlotsSpent(c, entry.slotLevel!, slotsSpent(before, entry.slotLevel!))
          : {
          ...c,
          abilityStates: c.abilityStates.map((s) =>
            s.actionId === entry.actionId
              ? (before.abilityStates.find((b) => b.actionId === entry.actionId) ?? s)
              : s,
          ),
        },
  );
  return { ...restored, log: restored.log.filter((e) => e.id !== entryId) };
}

// ---------- XP ----------

export function defeatedXP(combat: Combat): number {
  return combat.combatants
    .filter((c) => c.kind === 'creature' && c.isDead)
    .reduce((sum, c) => sum + c.xp, 0);
}

export function playerCount(combat: Combat): number {
  return combat.combatants.filter((c) => c.kind === 'player').length;
}

/** Creatures still standing. When this hits 0 the tracker suggests ending the combat. */
export function livingCreatureCount(combat: Combat): number {
  return combat.combatants.filter((c) => c.kind === 'creature' && !c.isDead).length;
}

// ---------- log text ----------

const MODIFIER_TEXT: Record<DamageModifier, string> = {
  normal: '',
  resisted: ' resisted',
  vulnerable: ' vulnerable',
  immune: ' immune',
};

/**
 * One-line description of a log entry for the combat log. `name` looks up a combatant's token
 * name (it may have been removed since); `actionName` looks up an ability's name; `spellName` a spell's.
 */
export function describeLogEntry(
  e: LogEntry,
  name: (combatantId: ID) => string,
  actionName: (combatantId: ID, actionId: ID) => string,
  spellName: (spellId: ID) => string = () => 'a spell',
): string {
  const who = name(e.combatantId);
  const ability = e.actionId ? actionName(e.combatantId, e.actionId) : '';
  switch (e.type) {
    case 'damage': {
      const raw = e.rawDamage ?? 0;
      const applied = e.appliedDamage ?? 0;
      const detail = e.modifier && e.modifier !== 'normal' ? ` (${raw}${MODIFIER_TEXT[e.modifier]})` : '';
      const dead = e.hpAfter === 0 && e.before && !e.before.isDead && e.before.kind === 'creature' ? ' and dies' : '';
      const type = e.damageType ? `${e.damageType} ` : '';
      return `${who} takes ${applied} ${type}damage${detail} → ${e.hpAfter} HP${dead}`;
    }
    case 'heal':
      return e.before?.isDead && (e.hpAfter ?? 0) > 0
        ? `${who} is revived → ${e.hpAfter} HP`
        : `${who} heals ${e.appliedDamage ?? 0} → ${e.hpAfter} HP`;
    case 'tempHP':
      return `${who} gains ${e.rawDamage ?? 0} temp HP`;
    case 'abilityUsed':
      return `${who} uses ${ability}`;
    case 'rechargeRolled': {
      if (e.roll === undefined) return `${who}: ${ability} adjusted by hand`;
      const wasRolled = e.before?.abilityStates.find((s) => s.actionId === e.actionId)?.status === 'rollNeeded';
      return wasRolled
        ? `${who}: ${ability} ready in ${e.roll} turn${e.roll === 1 ? '' : 's'}`
        : `${who}: ${ability} recharge roll ${e.roll}`;
    }
    case 'abilityReady':
      return `${who}: ${ability} is ready`;
    case 'conditionEnded':
      return `${who} is no longer ${e.condition ?? 'affected'}`;
    case 'spellCast':
      return `${who} casts ${e.spellId ? spellName(e.spellId) : 'a spell'} (${e.usesAfter ?? 1} used)`;
    case 'spellUsesAdjusted':
      return `${who}: ${e.spellId ? spellName(e.spellId) : 'spell'} use taken back (${e.usesAfter ?? 0} used)`;
    case 'slotUsed':
      return `${who} uses a ${slotLevelLabel(e.slotLevel ?? 1)} spell slot (${e.usesAfter ?? 1} used)`;
    case 'slotRestored':
      return `${who}: ${slotLevelLabel(e.slotLevel ?? 1)} spell slot given back (${e.usesAfter ?? 0} used)`;
  }
}
