import type { Combat, Combatant, CombatantKind, CreatureTemplate, ID } from '../models';

/**
 * What the player-facing page shows. Deliberately minimal: names, kinds of creature and round only,
 * never HP, stats or recharge state. Dead creatures never appear.
 */
export type TableView =
  | { status: 'waiting' }
  | { status: 'over' }
  | {
      status: 'active';
      round: number;
      current: TableGroup;
      /** The group that goes after the current one, or null when nobody else is left to act. */
      upNext: (TableGroup & { newRound: boolean }) | null;
    };

export interface TableGroup {
  kind: CombatantKind;
  names: string[];
  /** Parallel to `names`: the kind of creature players see (e.g. "Boar"), or null (players, or nothing to show). */
  creatures: Array<string | null>;
}

/** Looks up a stat block's name, for combatants added before it was snapshotted. */
export type TemplateNames = ReadonlyMap<ID, Pick<CreatureTemplate, 'name'>>;

/** The kind of creature the players see: the fake one while the DM has it on, otherwise the real one. */
export function shownCreature(c: Combatant, templates?: TemplateNames): string | null {
  if (c.kind !== 'creature') return null;
  const t = c.showFakeName
    ? c.fakeName
    : (c.creatureName ?? (c.templateId ? templates?.get(c.templateId)?.name : undefined));
  return t?.trim() || null;
}

const alive = (c: Combatant | undefined): c is Combatant => !!c && !c.isDead;

/**
 * Indices of the group starting at `start`. A creature stands alone; a player is shown together
 * with every player directly after them (wrapping into the next round) until the next living
 * creature. Dead creatures are skipped in turn order, so they don't split a run of players.
 */
function groupFrom(list: readonly Combatant[], start: number, exclude: ReadonlySet<number>): number[] {
  const first = list[start];
  if (!alive(first)) return [];
  if (first.kind === 'creature') return [start];
  const group = [start];
  for (let step = 1; step < list.length; step++) {
    const idx = (start + step) % list.length;
    if (exclude.has(idx) || idx === start) break;
    const c = list[idx]!;
    if (!alive(c)) continue;
    if (c.kind !== 'player') break;
    group.push(idx);
  }
  return group;
}

export function tableView(combat: Combat | null | undefined, templates?: TemplateNames): TableView {
  if (!combat || combat.status === 'staged') return { status: 'waiting' };
  if (combat.status === 'ended') return { status: 'over' };

  const list = combat.combatants;
  const n = list.length;
  const currentIdx = groupFrom(list, combat.turnIndex, new Set());
  const currentSet = new Set(currentIdx);
  const current: TableGroup = {
    kind: list[combat.turnIndex]?.kind ?? 'creature',
    names: currentIdx.map((i) => list[i]!.tokenName),
    creatures: currentIdx.map((i) => shownCreature(list[i]!, templates)),
  };

  // Walk forward from the end of the current group to the next living combatant outside it.
  const lastIdx = currentIdx.at(-1) ?? combat.turnIndex;
  const lastSteps = (lastIdx - combat.turnIndex + n) % n;
  let upNext: Extract<TableView, { status: 'active' }>['upNext'] = null;
  for (let step = lastSteps + 1; step < n + lastSteps + 1 && n > 0; step++) {
    const idx = (combat.turnIndex + step) % n;
    if (currentSet.has(idx)) break;
    if (!alive(list[idx])) continue;
    const group = groupFrom(list, idx, currentSet);
    upNext = {
      kind: list[idx]!.kind,
      names: group.map((i) => list[i]!.tokenName),
      creatures: group.map((i) => shownCreature(list[i]!, templates)),
      newRound: combat.turnIndex + step >= n,
    };
    break;
  }

  return { status: 'active', round: combat.round, current, upNext };
}
