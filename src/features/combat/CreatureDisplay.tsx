import { Button, TextInput } from '../../components/ui';
import { creatureShownOf, setAlly, setCreatureDisplay } from '../../logic';
import type { Combatant, CreatureShown, CreatureTemplate } from '../../models';
import type { UpdateCombat } from './useCombat';

/**
 * DM control for what kind of creature the player view shows: nothing (the default), the real one,
 * or a fake to keep a disguise.
 */
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
  const mode = creatureShownOf(c);
  const set = (change: { fakeName?: string; creatureShown?: CreatureShown }) =>
    update((cb) => setCreatureDisplay(cb, c.id, change));
  const choice = (value: CreatureShown, label: string) => (
    <Button
      aria-pressed={mode === value}
      variant={mode === value ? 'primary' : 'secondary'}
      onClick={() => set({ creatureShown: value })}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-stone-400" id={`creature-${c.id}`}>
        Players see creature
      </span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={`creature-${c.id}`}>
        {choice('hidden', 'Hidden')}
        {choice('real', `Real${real ? `: ${real}` : ''}`)}
        {choice('fake', 'Fake')}
        <TextInput
          aria-label={`Fake creature for ${c.tokenName}`}
          placeholder="e.g. Orc"
          value={c.fakeName ?? ''}
          onChange={(e) => set({ fakeName: e.target.value })}
          className="w-40 flex-1 text-sm"
        />
      </div>
      {mode === 'hidden' && <p className="text-xs text-stone-500">Players see only the token name.</p>}
      {mode === 'fake' && !c.fakeName?.trim() && (
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
