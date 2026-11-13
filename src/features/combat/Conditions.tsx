import { useEffect, useState } from 'react';
import { Button, Chip, Select, TextInput } from '../../components/ui';
import {
  clearConditions,
  conditionAnchor,
  conditionLabel,
  describeDuration,
  removeCondition,
  setCondition,
  toggleCondition,
} from '../../logic';
import {
  CONDITIONS,
  type ActiveCondition,
  type Combat,
  type Combatant,
  type ConditionTiming,
  type CreatureTemplate,
} from '../../models';
import type { UpdateCombat } from './useCombat';

function anchorName(combat: Combat, c: Combatant, cond: ActiveCondition): string {
  const id = conditionAnchor(combat, c, cond);
  return combat.combatants.find((x) => x.id === id)?.tokenName ?? c.tokenName;
}

/** Small badges on a turn-order row, with the rounds left on timed ones. */
export function ConditionBadges({ combat, combatant }: { combat: Combat; combatant: Combatant }) {
  if (combatant.conditions.length === 0) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle" aria-label="Conditions">
      {combatant.conditions.map((cond) => (
        <span
          key={cond.name}
          title={describeDuration(cond, anchorName(combat, combatant, cond))}
          className="rounded bg-violet-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200"
        >
          {conditionLabel(cond)}
        </span>
      ))}
    </span>
  );
}

/** Duration controls for one active condition: rounds (blank = until removed), start/end, whose turn. */
function DurationRow({
  combat,
  combatant,
  cond,
  update,
}: {
  combat: Combat;
  combatant: Combatant;
  cond: ActiveCondition;
  update: UpdateCombat;
}) {
  const [text, setText] = useState(cond.rounds?.toString() ?? '');
  useEffect(() => setText(cond.rounds?.toString() ?? ''), [cond.rounds]);
  const ends: ConditionTiming = cond.ends ?? 'end';
  const anchor = conditionAnchor(combat, combatant, cond);

  const apply = (patch: { rounds?: number | null; ends?: ConditionTiming; anchorId?: string }) => {
    const rounds = patch.rounds !== undefined ? patch.rounds : (cond.rounds ?? null);
    update((c) =>
      setCondition(c, combatant.id, cond.name, {
        rounds,
        ends: patch.ends ?? ends,
        anchorId: patch.anchorId ?? anchor,
      }),
    );
  };
  const commitRounds = () => {
    const t = text.trim();
    if (t === '') {
      if (cond.rounds !== undefined) apply({ rounds: null });
    } else if (/^\d+$/.test(t) && Number(t) >= 1) {
      if (Number(t) !== cond.rounds) apply({ rounds: Number(t) });
    } else setText(cond.rounds?.toString() ?? '');
  };
  const timed = cond.rounds !== undefined;

  return (
    <li className="flex flex-col gap-1 text-xs" aria-label={`${cond.name} duration`}>
      <div className="flex items-center gap-1.5">
        <span className="w-24 font-semibold capitalize text-violet-200">{cond.name}</span>
        <TextInput
          aria-label={`Rounds of ${cond.name}`}
          inputMode="numeric"
          placeholder="∞"
          title="Rounds; leave blank to last until removed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitRounds}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-12 px-1 py-0.5 text-center text-xs"
        />
        <span className="text-stone-500">{timed ? (cond.rounds === 1 ? 'round' : 'rounds') : 'until removed'}</span>
        <Button
          variant="ghost"
          className="ml-auto px-1.5 py-0 text-xs"
          aria-label={`Remove ${cond.name}`}
          onClick={() => update((c) => removeCondition(c, combatant.id, cond.name))}
        >
          ✕
        </Button>
      </div>
      {timed && (
        <div className="flex flex-wrap items-center gap-1 pl-3 text-stone-500">
          ends at the
          <Select
            aria-label={`When ${cond.name} ends`}
            value={ends}
            onChange={(e) => apply({ ends: e.target.value as ConditionTiming })}
            className="px-1 py-0.5 text-xs"
          >
            <option value="end">end</option>
            <option value="start">start</option>
          </Select>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            of
            <Select
              aria-label={`Whose turn ${cond.name} counts on`}
              value={anchor}
              onChange={(e) => apply({ anchorId: e.target.value })}
              className="max-w-36 px-1 py-0.5 text-xs"
            >
              {combat.combatants.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id === combatant.id ? `${x.tokenName} (itself)` : x.tokenName}
                </option>
              ))}
            </Select>
            <span className="ml-0.5">’s turn</span>
          </span>
        </div>
      )}
    </li>
  );
}

/**
 * Toggle chips for the side panel, plus duration controls for each active condition. Conditions the
 * stat block is immune to are marked and can't be applied.
 */
export function ConditionEditor({
  combat,
  combatant,
  template,
  update,
}: {
  combat: Combat;
  combatant: Combatant;
  template?: CreatureTemplate;
  update: UpdateCombat;
}) {
  const immune = new Set<string>(template?.conditionImmunities ?? []);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Conditions</h3>
        {combatant.conditions.length > 0 && (
          <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => update((c) => clearConditions(c, combatant.id))}>
            Clear
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Conditions for ${combatant.tokenName}`}>
        {CONDITIONS.map((name) =>
          immune.has(name) ? (
            <span
              key={name}
              className="rounded-full border border-dashed border-stone-700 px-2.5 py-0.5 text-xs capitalize text-stone-600"
              title="Immune (from the stat block)"
            >
              {name} · immune
            </span>
          ) : (
            <Chip
              key={name}
              on={combatant.conditions.some((x) => x.name === name)}
              onClick={() => update((c) => toggleCondition(c, combatant.id, name))}
            >
              {name}
            </Chip>
          ),
        )}
      </div>
      {combatant.conditions.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 rounded-md bg-stone-950/60 p-2" aria-label="Condition durations">
          {combatant.conditions.map((cond) => (
            <DurationRow key={cond.name} combat={combat} combatant={combatant} cond={cond} update={update} />
          ))}
        </ul>
      )}
    </div>
  );
}
