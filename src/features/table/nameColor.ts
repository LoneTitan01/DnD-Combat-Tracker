import type { CombatantKind } from '../../models';

/** Text colour for a name on the players' screens: enemies red, allied creatures green, players neutral. */
export function nameColor(who: { kind: CombatantKind; ally: boolean }, player = 'text-white'): string {
  if (who.kind !== 'creature') return player;
  return who.ally ? 'text-emerald-300' : 'text-red-300';
}
