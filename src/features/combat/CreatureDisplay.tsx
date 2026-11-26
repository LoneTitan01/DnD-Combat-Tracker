import { Button, TextInput } from '../../components/ui';
import { setAlly, setCreatureDisplay } from '../../logic';
import type { Combatant, CreatureTemplate } from '../../models';
import type { UpdateCombat } from './useCombat';

/** DM control for what kind of creature the player view shows: the real one, or a fake to keep a disguise. */
export function CreatureDisplay({
  combatant: c,
  template,
  update,
}: {
  combatant: Combatant;
  template: CreatureTemplate | undefined;
  update: UpdateCombat;
}) {
  const real = c.creatureName ?? template?.name ?? '';
  const fake = !!c.showFakeName;
  const set = (change: { fakeName?: string; showFakeName?: boolean }) =>
    update((cb) => setCreatureDisplay(cb, c.id, change));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-stone-400" id={`creature-${c.id}`}>
        Players see creature
      </span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={`creature-${c.id}`}>
        <Button
          aria-pressed={!fake}
          variant={!fake ? 'primary' : 'secondary'}
          onClick={() => set({ showFakeName: false })}
        >
          Real{real ? `: ${real}` : ''}
        </Button>
        <Button aria-pressed={fake} variant={fake ? 'primary' : 'secondary'} onClick={() => set({ showFakeName: true })}>
          Fake
        </Button>
        <TextInput
          aria-label={`Fake creature for ${c.tokenName}`}
          placeholder="e.g. Orc"
          value={c.fakeName ?? ''}
          onChange={(e) => set({ fakeName: e.target.value })}
          className="w-40 flex-1 text-sm"
        />
      </div>
      {fake && !c.fakeName?.trim() && (
        <p className="text-xs text-stone-500">No fake creature entered, so players see only the token name.</p>
      )}
      <label className="flex items-center gap-2 text-sm text-stone-300">
        <input
          type="checkbox"
          className="h-4 w-4 accent-emerald-500"
          checked={!!c.ally}
          onChange={(e) => update((cb) => setAlly(cb, c.id, e.target.checked))}
        />
        Ally of the players <span className="text-xs text-stone-500">(name shows green instead of red)</span>
      </label>
    </div>
  );
}
