import { useState } from 'react';
import { Button, NumberField, TextInput } from '../../components/ui';
import {
  dismissPrompt,
  parseDice,
  pendingPrompts,
  rechargeLabel,
  resolveRolledRecharge,
  resolveThresholdRoll,
  rollD6,
  rollDice,
  setAbilityState,
  useAbility,
} from '../../logic';
import type { AbilityState, Action, Combatant, CreatureTemplate } from '../../models';
import type { UpdateCombat } from './useCombat';

function chipText(s: AbilityState, action: Action): string {
  switch (s.status) {
    case 'ready':
      return 'Ready';
    case 'counting': {
      const n = s.turnsRemaining ?? 0;
      return n <= 0 ? 'Ready next turn' : `Recharging — ${n} turn${n === 1 ? '' : 's'}`;
    }
    case 'rollNeeded':
      return 'Roll needed';
    case 'thresholdRoll':
      return action.recharge ? rechargeLabel(action.recharge) : 'Recharge roll';
  }
}

/** One chip per rechargeable ability. Ready → Use; otherwise click to adjust by hand. */
export function RechargeChips({
  combatant,
  template,
  update,
}: {
  combatant: Combatant;
  template: CreatureTemplate | undefined;
  update: UpdateCombat;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [turns, setTurns] = useState(1);
  if (!template || combatant.abilityStates.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {combatant.abilityStates.map((s) => {
        const action = template.actions.find((a) => a.id === s.actionId);
        if (!action?.recharge) return null;
        const ready = s.status === 'ready';
        const isEditing = editing === s.actionId;
        return (
          <span
            key={s.actionId}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              ready ? 'border-emerald-700 bg-emerald-950/50 text-emerald-200' : 'border-stone-600 bg-stone-800 text-stone-300'
            }`}
          >
            <button
              type="button"
              className="hover:underline"
              aria-label={`${action.name}: ${chipText(s, action)}. Adjust`}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(isEditing ? null : s.actionId);
                setTurns(Math.max(1, s.turnsRemaining ?? 1));
              }}
            >
              <span className="font-semibold">{action.name}</span> · {chipText(s, action)}
            </button>
            {ready && !combatant.isDead && (
              <button
                type="button"
                className="ml-1 rounded bg-emerald-700 px-1.5 font-semibold text-white hover:bg-emerald-600"
                onClick={(e) => {
                  e.stopPropagation();
                  update((c) => useAbility(c, combatant.id, action.id, action.recharge!));
                }}
              >
                Use
              </button>
            )}
            {isEditing && (
              <span className="ml-1 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {!ready && (
                  <button
                    type="button"
                    className="rounded bg-stone-700 px-1.5 hover:bg-stone-600"
                    onClick={() => {
                      update((c) => setAbilityState(c, combatant.id, action.id, { ready: true }));
                      setEditing(null);
                    }}
                  >
                    Mark ready
                  </button>
                )}
                <NumberField
                  aria-label={`Turns until ${action.name} is ready`}
                  value={turns}
                  min={0}
                  max={99}
                  onChange={setTurns}
                  className="w-12 px-1 py-0 text-center text-xs"
                />
                <button
                  type="button"
                  className="rounded bg-stone-700 px-1.5 hover:bg-stone-600"
                  onClick={() => {
                    update((c) => setAbilityState(c, combatant.id, action.id, { turnsRemaining: turns }));
                    setEditing(null);
                  }}
                >
                  Set turns
                </button>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Prompt({
  combatant,
  action,
  kind,
  update,
}: {
  combatant: Combatant;
  action: Action;
  kind: 'rolled' | 'threshold';
  update: UpdateCombat;
}) {
  const [value, setValue] = useState('');
  const r = action.recharge!;
  const dice = r.dice && parseDice(r.dice) ? r.dice : '1d6';
  const min = r.minRoll ?? 5;
  const n = /^\d+$/.test(value.trim()) ? Number(value) : null;
  const question =
    kind === 'rolled'
      ? `${action.name} (${dice}): turns until ready?`
      : `${action.name} (${rechargeLabel(r)}): roll a d6`;

  const confirm = () => {
    if (n === null) return;
    update((c) =>
      kind === 'rolled'
        ? resolveRolledRecharge(c, combatant.id, action.id, n)
        : resolveThresholdRoll(c, combatant.id, action.id, n, min),
    );
  };

  return (
    <div
      role="group"
      aria-label={question}
      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-600/60 bg-amber-950/40 px-3 py-2 text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="font-semibold text-amber-200">{question}</span>
      <TextInput
        aria-label={kind === 'rolled' ? 'Turns until ready' : 'd6 roll'}
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && confirm()}
        className="w-16 text-center"
      />
      <Button onClick={() => setValue(String(kind === 'rolled' ? rollDice(dice) : rollD6()))}>Roll for me</Button>
      <Button variant="primary" disabled={n === null} onClick={confirm}>
        Confirm
      </Button>
      <Button variant="ghost" onClick={() => update((c) => dismissPrompt(c, combatant.id, action.id))}>
        Dismiss
      </Button>
      {kind === 'threshold' && n !== null && (
        <span className={n >= min ? 'text-emerald-300' : 'text-stone-400'}>
          {n >= min ? 'Recharged!' : 'Not yet'}
        </span>
      )}
    </div>
  );
}

/** Roll banners and "is ready" notices for the combatant whose turn it is. */
export function TurnBanners({
  combatant,
  template,
  update,
}: {
  combatant: Combatant;
  template: CreatureTemplate | undefined;
  update: UpdateCombat;
}) {
  if (!template) return null;
  const prompts = pendingPrompts(combatant);
  const ready = combatant.abilityStates.filter((s) => s.justReady);
  if (prompts.length === 0 && ready.length === 0) return null;
  const actionFor = (id: string) => template.actions.find((a) => a.id === id);
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {ready.map((s) => (
        <p key={s.actionId} role="status" className="text-sm font-semibold text-emerald-300">
          ✦ {actionFor(s.actionId)?.name ?? 'Ability'} is ready
        </p>
      ))}
      {prompts.map((p) => {
        const action = actionFor(p.actionId);
        return action?.recharge ? (
          <Prompt key={p.actionId} combatant={combatant} action={action} kind={p.kind} update={update} />
        ) : null;
      })}
    </div>
  );
}
