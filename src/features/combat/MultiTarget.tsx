import { useState } from 'react';
import { Button, Card, Select, TextInput } from '../../components/ui';
import { computeApplied, damageMany, modifierFor } from '../../logic';
import { DAMAGE_TYPES, type Combat, type CreatureTemplate, type DamageModifier, type DamageType, type ID } from '../../models';
import type { UpdateCombat } from './useCombat';

/** Per-target modifier override; null follows the stat block for the chosen damage type. */
export type Targets = Record<ID, DamageModifier | null>;

const MODS: Array<{ mod: DamageModifier; short: string; long: string }> = [
  { mod: 'normal', short: 'Normal', long: 'Normal' },
  { mod: 'resisted', short: '½', long: 'Resisted' },
  { mod: 'vulnerable', short: '×2', long: 'Vulnerable' },
  { mod: 'immune', short: '0', long: 'Immune' },
];

/**
 * Same raw damage to several creatures at once (fireball), each with its own modifier.
 * Every target gets its own log entry, so each can be undone separately.
 */
export function MultiTargetPanel({
  combat,
  templates,
  targets,
  setTargets,
  update,
  onDone,
}: {
  combat: Combat;
  templates: ReadonlyMap<ID, CreatureTemplate>;
  targets: Targets;
  setTargets: (t: Targets) => void;
  update: UpdateCombat;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [damageType, setDamageType] = useState<DamageType | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const n = /^\d+$/.test(amount.trim()) ? Number(amount) : null;
  const chosen = combat.combatants.filter((c) => c.id in targets && !c.isDead);
  const tplOf = (id: ID) => {
    const tid = combat.combatants.find((c) => c.id === id)?.templateId;
    return tid ? templates.get(tid) : undefined;
  };
  const modOf = (id: ID): DamageModifier => targets[id] ?? modifierFor(tplOf(id), damageType);

  const changeType = (t: DamageType | null) => {
    setDamageType(t);
    setApplied(null);
    // A new damage type re-reads every stat block, dropping hand-picked overrides.
    setTargets(Object.fromEntries(Object.keys(targets).map((id) => [id, null])));
  };
  const apply = () => {
    if (n === null || chosen.length === 0) return;
    update((c) => damageMany(c, n, chosen.map((x) => ({ id: x.id, modifier: modOf(x.id) })), damageType));
    const typed = damageType ? `${damageType} ` : '';
    setApplied(`${n} ${typed}damage applied to ${chosen.length} target${chosen.length === 1 ? '' : 's'}.`);
    setAmount('');
  };

  return (
    <Card className="flex flex-col gap-3 border-sky-800/70">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-sky-200">Multi-target damage</h2>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
      <p className="text-xs text-stone-400">Click creatures in the turn order to add or remove them.</p>
      <div className="flex items-center gap-2">
        <TextInput
          aria-label="Damage to all targets"
          inputMode="numeric"
          placeholder="Damage"
          value={amount}
          autoFocus
          onChange={(e) => {
            setAmount(e.target.value);
            setApplied(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          className="w-24 text-center text-lg"
        />
        <Select
          aria-label="Damage type for all targets"
          value={damageType ?? ''}
          onChange={(e) => changeType((e.target.value || null) as DamageType | null)}
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
      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={n === null || chosen.length === 0} onClick={apply}>
          Apply to {chosen.length} target{chosen.length === 1 ? '' : 's'}
        </Button>
      </div>
      {applied && (
        <p className="text-sm text-emerald-300" role="status">
          {applied}
        </p>
      )}
      {chosen.length === 0 ? (
        <p className="text-sm text-stone-500">No targets yet.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Targets">
          {chosen.map((c) => {
            const t = tplOf(c.id);
            const hint = [
              t?.damageResistances.length ? `resists ${t.damageResistances.join(', ')}` : '',
              t?.damageVulnerabilities.length ? `vulnerable to ${t.damageVulnerabilities.join(', ')}` : '',
              t?.damageImmunities.length ? `immune to ${t.damageImmunities.join(', ')}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const mod = modOf(c.id);
            const fromStatBlock = targets[c.id] == null && mod !== 'normal';
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 border-t border-stone-800 pt-2 first:border-t-0 first:pt-0">
                <div className="min-w-28 flex-1">
                  <div className="font-semibold text-stone-100">{c.tokenName}</div>
                  {hint && <div className="text-xs text-amber-300">{hint}</div>}
                  {fromStatBlock && <div className="text-xs text-stone-500">{MODS.find((m) => m.mod === mod)!.long} from stat block</div>}
                </div>
                <div className="flex overflow-hidden rounded-md border border-stone-700" role="radiogroup" aria-label={`Modifier for ${c.tokenName}`}>
                  {MODS.map((m) => (
                    <button
                      key={m.mod}
                      type="button"
                      role="radio"
                      aria-checked={mod === m.mod}
                      aria-label={m.long}
                      onClick={() => setTargets({ ...targets, [c.id]: m.mod })}
                      className={`px-2 py-1 text-xs ${mod === m.mod ? 'bg-sky-600 text-white' : 'bg-stone-900 text-stone-400 hover:text-stone-100'}`}
                    >
                      {m.short}
                    </button>
                  ))}
                </div>
                <span className="w-14 text-right text-xs tabular-nums text-stone-400">
                  {n !== null ? `−${computeApplied(n, mod)}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
