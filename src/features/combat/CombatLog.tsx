import { Button, Card } from '../../components/ui';
import { canUndo, defeatedXP, describeLogEntry, playerCount, undoLogEntry, xpPerPlayer } from '../../logic';
import type { Combat, CreatureTemplate, ID } from '../../models';
import { useSpellMap } from './SpellUses';
import type { UpdateCombat } from './useCombat';

export function XPTally({ combat }: { combat: Combat }) {
  const total = defeatedXP(combat);
  const players = playerCount(combat);
  const dead = combat.combatants.filter((c) => c.kind === 'creature' && c.isDead);
  return (
    <Card className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">XP</h2>
      <p className="text-2xl font-bold tabular-nums text-amber-300" aria-label="XP earned">
        {total.toLocaleString()}
      </p>
      <p className="text-sm text-stone-400">
        {players > 0 ? `${xpPerPlayer(total, players).toLocaleString()} each for ${players} player${players === 1 ? '' : 's'}` : 'no players'}
        {dead.length > 0 && ` · ${dead.length} defeated`}
      </p>
    </Card>
  );
}

/** Newest first. Undo appears on entries that are the latest in their stream. */
export function CombatLog({
  combat,
  templates,
  update,
  readOnly = false,
}: {
  combat: Combat;
  templates: ReadonlyMap<ID, CreatureTemplate>;
  update?: UpdateCombat;
  readOnly?: boolean;
}) {
  const byId = new Map(combat.combatants.map((c) => [c.id, c]));
  const name = (id: ID) => byId.get(id)?.tokenName ?? 'Removed combatant';
  const actionName = (cid: ID, aid: ID) => {
    const t = byId.get(cid)?.templateId;
    return (t && templates.get(t)?.actions.find((a) => a.id === aid)?.name) || 'ability';
  };
  const spells = useSpellMap(combat.log.flatMap((e) => (e.spellId ? [e.spellId] : [])));
  const spellName = (id: ID) => spells.get(id)?.name ?? 'a spell';
  const entries = [...combat.log].reverse();
  return (
    <Card>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Log</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-stone-500">Nothing yet.</p>
      ) : (
        <ol className="max-h-80 overflow-y-auto text-sm" aria-label="Combat log">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-t border-stone-800/70 py-1 first:border-t-0">
              <span className="w-8 shrink-0 text-xs tabular-nums text-stone-500">R{e.round}</span>
              <span className="flex-1 text-stone-300">{describeLogEntry(e, name, actionName, spellName)}</span>
              {!readOnly && update && canUndo(combat, e.id) && (
                <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => update((c) => undoLogEntry(c, e.id))}>
                  Undo
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
