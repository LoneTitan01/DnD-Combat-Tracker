import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, NumberField, TextInput } from '../../components/ui';
import { db } from '../../db';
import {
  addCreature,
  changeInitiative,
  duplicateTokenNames,
  formatMod,
  removeCombatant,
  renameToken,
  resetCreatureHP,
  rollInitiative,
  rollMissingCreatureInitiative,
  setCreatureHP,
  startCombat,
  type AttendingPlayer,
} from '../../logic';
import type { Combat, Combatant, CreatureTemplate, ID } from '../../models';
import { CreaturePicker } from '../bestiary/CreaturePicker';
import { InitiativeInput } from './InitiativeInput';
import type { UpdateCombat } from './useCombat';

function StagedRow({
  c,
  template,
  duplicate,
  update,
}: {
  c: Combatant;
  template: CreatureTemplate | undefined;
  duplicate: boolean;
  update: UpdateCombat;
}) {
  return (
    <tr className="border-t border-stone-800 align-top">
      <td className="py-2 pr-2">
        <TextInput
          aria-label={`Token name for ${c.tokenName}`}
          value={c.tokenName}
          onChange={(e) => update((cb) => renameToken(cb, c.id, e.target.value))}
          className={`w-full min-w-36 ${duplicate ? 'border-amber-500' : ''}`}
        />
        <div className="mt-0.5 text-xs text-stone-500">
          {template ? template.name : 'Deleted stat block'}
          {duplicate && <span className="ml-2 text-amber-400">Duplicate token name</span>}
        </div>
      </td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-1">
          <NumberField
            aria-label={`HP for ${c.tokenName}`}
            value={c.maxHP}
            min={1}
            max={99999}
            onChange={(hp) => update((cb) => setCreatureHP(cb, c.id, hp))}
            className="w-20 text-center"
          />
          {template && (
            <>
              <Button
                variant="ghost"
                title="Average HP from the stat block"
                aria-label={`Average HP for ${c.tokenName}`}
                onClick={() => update((cb) => resetCreatureHP(cb, c.id, template, 'average'))}
              >
                Avg
              </Button>
              <Button
                variant="ghost"
                title="Roll the hit dice"
                aria-label={`Roll HP for ${c.tokenName}`}
                onClick={() => update((cb) => resetCreatureHP(cb, c.id, template, 'rolled'))}
              >
                Roll
              </Button>
            </>
          )}
        </div>
      </td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-1">
          <InitiativeInput
            label={`Initiative for ${c.tokenName}`}
            value={c.initiative}
            onCommit={(n) => update((cb) => changeInitiative(cb, c.id, n))}
          />
          <Button
            variant="ghost"
            title={`d20 ${formatMod(c.initiativeBonus)}`}
            aria-label={`Roll initiative for ${c.tokenName}`}
            onClick={() => update((cb) => changeInitiative(cb, c.id, rollInitiative(c)))}
          >
            Roll
          </Button>
        </div>
      </td>
      <td className="py-2 text-right">
        <Button variant="ghost" aria-label={`Remove ${c.tokenName}`} onClick={() => update((cb) => removeCombatant(cb, c.id))}>
          ✕
        </Button>
      </td>
    </tr>
  );
}

function StartCombatPanel({ combat, update, onCancel }: { combat: Combat; update: UpdateCombat; onCancel: () => void }) {
  const players = useLiveQuery(() => db.players.orderBy('name').toArray());
  const [absent, setAbsent] = useState<Set<ID>>(new Set());
  const [inits, setInits] = useState<Record<ID, string>>({});
  const present = (players ?? []).filter((p) => !absent.has(p.id));
  const missing = present.filter((p) => !/^[+-]?\d+$/.test((inits[p.id] ?? '').trim()));
  const unrolled = combat.combatants.filter((c) => c.kind === 'creature' && c.initiative === null).length;
  const tokenNames = new Set(combat.combatants.map((c) => c.tokenName.trim().toLowerCase()));
  const clashes = present.filter((p) => tokenNames.has(p.name.trim().toLowerCase()));

  const start = () => {
    const attending: AttendingPlayer[] = present.map((p) => ({ player: p, initiative: Number(inits[p.id]) }));
    update((c) => startCombat(c, attending));
  };

  return (
    <Card className="border-amber-700/60">
      <h2 className="font-display text-xl font-semibold text-amber-300">Start combat</h2>
      <p className="mt-1 text-sm text-stone-400">Tick who is here and type in each player's initiative roll.</p>
      {players && players.length === 0 && (
        <p className="mt-3 text-sm text-stone-400">
          The party roster is empty.{' '}
          <Link to="/party" className="text-amber-400 hover:underline">
            Add players
          </Link>{' '}
          or start with creatures only.
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-2" aria-label="Players present">
        {(players ?? []).map((p) => {
          const here = !absent.has(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3">
              <label className="flex min-w-40 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-amber-500"
                  checked={here}
                  onChange={() => {
                    const next = new Set(absent);
                    if (here) next.add(p.id);
                    else next.delete(p.id);
                    setAbsent(next);
                  }}
                />
                {p.name}
              </label>
              {here && (
                <TextInput
                  aria-label={`Initiative for ${p.name}`}
                  inputMode="numeric"
                  placeholder={`d20 ${formatMod(p.initiativeBonus)}`}
                  value={inits[p.id] ?? ''}
                  onChange={(e) => setInits({ ...inits, [p.id]: e.target.value })}
                  className="w-24 text-center"
                />
              )}
            </li>
          );
        })}
      </ul>
      {clashes.length > 0 && (
        <p className="mt-3 text-xs text-amber-400">
          {clashes.map((p) => p.name).join(', ')} {clashes.length === 1 ? 'shares' : 'share'} a name with a creature token.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={missing.length > 0} onClick={start}>
          Roll for initiative!
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Back to staging
        </Button>
        <p className="text-xs text-stone-500">
          {missing.length > 0
            ? `Waiting for initiative from ${missing.map((p) => p.name).join(', ')}.`
            : unrolled > 0
              ? `${unrolled} creature${unrolled === 1 ? '' : 's'} without initiative will roll now.`
              : 'Everyone has initiative.'}
        </p>
      </div>
    </Card>
  );
}

export function StagingView({
  combat,
  update,
  templates,
}: {
  combat: Combat;
  update: UpdateCombat;
  templates: ReadonlyMap<ID, CreatureTemplate>;
}) {
  const [starting, setStarting] = useState(false);
  const dupes = useMemo(() => duplicateTokenNames(combat), [combat]);
  const creatures = useMemo(() => [...templates.values()], [templates]);
  const rows = combat.combatants.filter((c) => c.kind === 'creature');

  const forAll = (fn: (c: Combat, x: Combatant, t: CreatureTemplate) => Combat) =>
    update((c) =>
      c.combatants.reduce((acc, x) => {
        const t = x.templateId ? templates.get(x.templateId) : undefined;
        return t ? fn(acc, x, t) : acc;
      }, c),
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-400">
        Staged and ready to run. Set token names to match your minis, set or roll HP, and optionally pre-roll
        initiative. Players are added when you start.
      </p>

      {starting ? (
        <StartCombatPanel combat={combat} update={update} onCancel={() => setStarting(false)} />
      ) : (
        <div>
          <Button variant="primary" className="px-5 py-2 text-base" onClick={() => setStarting(true)}>
            Start combat…
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-x-auto">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button onClick={() => forAll((c, x, t) => resetCreatureHP(c, x.id, t, 'average'))}>Average HP for all</Button>
            <Button onClick={() => forAll((c, x, t) => resetCreatureHP(c, x.id, t, 'rolled'))}>Roll HP for all</Button>
            <Button onClick={() => update((c) => rollMissingCreatureInitiative(c))}>Roll missing initiative</Button>
            <Button
              variant="ghost"
              onClick={() => update((c) => ({ ...c, combatants: c.combatants.map((x) => ({ ...x, initiative: null })) }))}
            >
              Clear initiative
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-stone-500">No creatures. Add some from the bestiary.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="pb-1 font-medium">Token</th>
                  <th className="pb-1 font-medium">HP</th>
                  <th className="pb-1 font-medium">Initiative</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <StagedRow
                    key={c.id}
                    c={c}
                    template={c.templateId ? templates.get(c.templateId) : undefined}
                    duplicate={dupes.has(c.tokenName.trim().toLowerCase())}
                    update={update}
                  />
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <aside>
          <CreaturePicker
            title="Add reinforcements"
            creatures={creatures}
            onAdd={(tid) => {
              const t = templates.get(tid);
              if (t) update((c) => addCreature(c, t));
            }}
          />
        </aside>
      </div>
    </div>
  );
}
