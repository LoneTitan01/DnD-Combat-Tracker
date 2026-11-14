import { useEffect, useRef, useState } from 'react';
import { Button, Card, Select, TextInput } from '../../components/ui';
import {
  computeApplied,
  damageCombatant,
  healCombatant,
  modifierFor,
  removeCombatant,
  renameToken,
  reviveCombatant,
  tempHPCombatant,
} from '../../logic';
import { DAMAGE_TYPES, type Combat, type Combatant, type CreatureTemplate, type DamageModifier, type DamageType } from '../../models';
import { StatBlock } from '../bestiary/StatBlock';
import { CombatNotes } from './CombatNotes';
import { ConditionEditor } from './Conditions';
import { CreatureDisplay } from './CreatureDisplay';
import type { UpdateCombat } from './useCombat';

export function HPBar({ c }: { c: Combatant }) {
  const pct = c.maxHP > 0 ? Math.round((c.currentHP / c.maxHP) * 100) : 0;
  const color = c.isDead ? 'bg-stone-600' : pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-24 overflow-hidden rounded-full bg-stone-800"
        role="meter"
        aria-label={`${c.tokenName} HP`}
        aria-valuemin={0}
        aria-valuemax={c.maxHP}
        aria-valuenow={c.currentHP}
      >
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-stone-300">
        {c.currentHP}/{c.maxHP}
        {c.tempHP > 0 && <span className="text-sky-300"> +{c.tempHP}</span>}
      </span>
    </div>
  );
}

/** Token name heading; click it to rename. Enter or leaving the box saves, Escape cancels. */
function TokenNameHeading({ c, combat, update }: { c: Combatant; combat: Combat; update: UpdateCombat }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.tokenName);
  const cancelled = useRef(false);
  useEffect(() => setEditing(false), [c.id]);

  const commit = () => {
    setEditing(false);
    if (cancelled.current) return;
    const name = draft.trim();
    if (name && name !== c.tokenName) update((cb) => renameToken(cb, c.id, name));
  };
  const duplicate =
    editing &&
    draft.trim() !== '' &&
    combat.combatants.some((x) => x.id !== c.id && x.tokenName.trim().toLowerCase() === draft.trim().toLowerCase());

  if (!editing) {
    return (
      <h2 className="font-display text-xl font-bold text-stone-100">
        <button
          type="button"
          className="cursor-text rounded text-left hover:underline hover:decoration-stone-500 hover:decoration-dotted"
          title="Click to rename"
          onClick={() => {
            cancelled.current = false;
            setDraft(c.tokenName);
            setEditing(true);
          }}
        >
          {c.tokenName}
        </button>
      </h2>
    );
  }
  return (
    <div>
      <TextInput
        autoFocus
        className="font-display text-xl font-bold"
        aria-label={`Token name for ${c.tokenName}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      {duplicate && <p className="mt-1 text-xs text-amber-400">Another combatant already has this name</p>}
    </div>
  );
}

const MODS: Array<{ mod: DamageModifier; label: string }> = [
  { mod: 'normal', label: 'Normal' },
  { mod: 'resisted', label: 'Resisted ½' },
  { mod: 'vulnerable', label: 'Vulnerable ×2' },
  { mod: 'immune', label: 'Immune 0' },
];

const SUGGESTION_TEXT: Record<DamageModifier, string> = {
  normal: 'takes it normally',
  resisted: 'resists it (½)',
  vulnerable: 'is vulnerable (×2)',
  immune: 'is immune (0)',
};

/** Side panel for the selected creature: damage/heal controls above its full stat block. */
export function CreaturePanel({
  combatant: c,
  template,
  update,
  combat,
  focusSignal = 0,
  autoFocus = true,
  onClose,
}: {
  combatant: Combatant;
  template: CreatureTemplate | undefined;
  update: UpdateCombat;
  combat: Combat;
  focusSignal?: number;
  /** Focus the damage box when the panel opens; off when it opened by itself on a turn change. */
  autoFocus?: boolean;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [damageType, setDamageType] = useState<DamageType | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setAmount(''), [c.id]);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [c.id, focusSignal]);

  const n = /^\d+$/.test(amount.trim()) ? Number(amount) : null;
  const apply = (fn: (amount: number) => void) => {
    if (n === null) return;
    fn(n);
    setAmount('');
    input.current?.focus();
  };
  // The stat block decides the modifier for a typed hit; the buttons can still override it.
  const suggested = modifierFor(template, damageType);
  const hit = (mod: DamageModifier) =>
    apply((a) => {
      update((cb) => damageCombatant(cb, c.id, a, mod, damageType));
      setDamageType(null);
    });
  const hints = template
    ? [
        template.damageResistances.length && `Resists ${template.damageResistances.join(', ')}`,
        template.damageVulnerabilities.length && `Vulnerable to ${template.damageVulnerabilities.join(', ')}`,
        template.damageImmunities.length && `Immune to ${template.damageImmunities.join(', ')}`,
      ].filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3 border-amber-800/60">
        <div className="flex items-start justify-between gap-2">
          <div>
            <TokenNameHeading c={c} combat={combat} update={update} />
            <HPBar c={c} />
          </div>
          <Button variant="ghost" aria-label="Close panel" onClick={onClose}>
            ✕
          </Button>
        </div>
        {hints.length > 0 && <p className="text-xs text-amber-300">{hints.join(' · ')}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            ref={input}
            aria-label={`Amount for ${c.tokenName}`}
            inputMode="numeric"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') hit(suggested);
            }}
            className="w-24 text-center text-lg"
          />
          <Select
            aria-label="Damage type"
            value={damageType ?? ''}
            onChange={(e) => setDamageType((e.target.value || null) as DamageType | null)}
            className="capitalize"
          >
            <option value="">Untyped</option>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {MODS.map(({ mod, label }) => (
            <Button
              key={mod}
              variant={mod === suggested ? 'primary' : 'secondary'}
              disabled={n === null}
              title={n !== null ? `${computeApplied(n, mod)} damage` : undefined}
              onClick={() => hit(mod)}
            >
              {label}
            </Button>
          ))}
        </div>
        {damageType && template && (
          <p className="text-xs text-stone-400" role="status" aria-label="Damage type suggestion">
            <span className="capitalize">{damageType}</span>: {c.tokenName} {SUGGESTION_TEXT[suggested]} per the stat block.
            Enter applies this.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={n === null} onClick={() => apply((a) => update((cb) => healCombatant(cb, c.id, a)))}>
            Heal
          </Button>
          <Button disabled={n === null} onClick={() => apply((a) => update((cb) => tempHPCombatant(cb, c.id, a)))}>
            Temp HP
          </Button>
          {c.isDead && (
            <Button onClick={() => update((cb) => reviveCombatant(cb, c.id, n ?? 1))}>
              Revive{n !== null ? ` with ${n} HP` : ''}
            </Button>
          )}
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              if (confirm(`Remove ${c.tokenName} from the combat?`)) {
                update((cb) => removeCombatant(cb, c.id));
                onClose();
              }
            }}
          >
            Remove from combat
          </Button>
        </div>
        <p className="text-xs text-stone-500">
          Enter applies the highlighted damage. Pick a damage type to use the stat block's resistances. Resisted rounds down.
        </p>
        <ConditionEditor combat={combat} combatant={c} template={template} update={update} />
        <CreatureDisplay combatant={c} template={template} update={update} />
        <CombatNotes key={c.id} combatant={c} update={update} />
      </Card>
      {template ? (
        <StatBlock creature={template} />
      ) : (
        <p className="text-sm text-stone-500">This creature's stat block was deleted from the bestiary.</p>
      )}
    </div>
  );
}
