import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Card, Chip, Field, NumberField, PageHeader, Select, TextArea, TextInput } from '../../components/ui';
import { db, saveCreature } from '../../db';
import {
  ACTION_KIND_LABELS,
  CR_VALUES,
  abilityMod,
  averageHP,
  blankCreature,
  changeCR,
  changeHitDice,
  changeSize,
  conHitDiceBonus,
  formatMod,
  newId,
  validateCreature,
  validateRecharge,
  xpForCR,
} from '../../logic';
import {
  ABILITIES,
  ACTION_KINDS,
  CONDITIONS,
  DAMAGE_TYPES,
  NONMAGICAL,
  DEFENSE_TYPES,
  DIE_TYPES,
  SIZES,
  type Action,
  type ActionKind,
  type CreatureTemplate,
  type DieType,
  type Recharge,
  type Size,
  type Trait,
} from '../../models';
import { StatBlock } from './StatBlock';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 font-display text-lg font-semibold text-amber-300">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </Card>
  );
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return [...list];
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x!);
  return out;
}

function RowControls({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Button variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>
        ↑
      </Button>
      <Button variant="ghost" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
        ↓
      </Button>
      <Button variant="ghost" aria-label="Remove" onClick={onRemove}>
        ✕
      </Button>
    </div>
  );
}

const DEFAULT_RECHARGE: Record<Recharge['mode'], Recharge> = {
  threshold: { mode: 'threshold', minRoll: 5 },
  fixed: { mode: 'fixed', turns: 3 },
  rolled: { mode: 'rolled', dice: '1d6' },
};

function RechargeEditor({ recharge, onChange }: { recharge: Recharge; onChange: (r: Recharge) => void }) {
  const error = validateRecharge(recharge);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md bg-stone-950/60 p-2">
      <Field label="Recharge mode">
        <Select
          value={recharge.mode}
          onChange={(e) => onChange(DEFAULT_RECHARGE[e.target.value as Recharge['mode']])}
        >
          <option value="threshold">Recharge X–6 (d6 roll)</option>
          <option value="fixed">After a fixed number of turns</option>
          <option value="rolled">After a rolled number of turns</option>
        </Select>
      </Field>
      {recharge.mode === 'threshold' && (
        <Field label="Recharges on">
          <Select
            value={recharge.minRoll ?? 5}
            onChange={(e) => onChange({ ...recharge, minRoll: Number(e.target.value) })}
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 6 ? '6' : `${n}–6`}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {recharge.mode === 'fixed' && (
        <Field label="Turns">
          <NumberField
            value={recharge.turns ?? 1}
            min={1}
            max={99}
            onChange={(turns) => onChange({ ...recharge, turns })}
            className="w-20"
          />
        </Field>
      )}
      {recharge.mode === 'rolled' && (
        <Field label="Dice">
          <TextInput
            value={recharge.dice ?? ''}
            placeholder="1d6"
            onChange={(e) => onChange({ ...recharge, dice: e.target.value })}
            className="w-24"
          />
        </Field>
      )}
      {error && <p className="pb-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TraitsEditor({ traits, onChange }: { traits: Trait[]; onChange: (t: Trait[]) => void }) {
  const set = (i: number, patch: Partial<Trait>) => onChange(traits.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <>
      {traits.map((t, i) => (
        <div key={t.id} className="flex flex-col gap-2 border-l-2 border-stone-700 pl-3">
          <div className="flex items-center gap-2">
            <TextInput
              value={t.name}
              placeholder="Trait name, e.g. Pack Tactics"
              onChange={(e) => set(i, { name: e.target.value })}
              className="flex-1 font-semibold"
            />
            <RowControls
              index={i}
              count={traits.length}
              onMove={(to) => onChange(move(traits, i, to))}
              onRemove={() => onChange(traits.filter((_, j) => j !== i))}
            />
          </div>
          <TextArea value={t.description} placeholder="Description" onChange={(e) => set(i, { description: e.target.value })} />
        </div>
      ))}
      <div>
        <Button onClick={() => onChange([...traits, { id: newId(), name: '', description: '' }])}>+ Add trait</Button>
      </div>
    </>
  );
}

function ActionsEditor({
  kind,
  actions,
  onChange,
}: {
  kind: ActionKind;
  actions: Action[];
  onChange: (kind: ActionKind, a: Action[]) => void;
}) {
  const mine = actions.filter((a) => a.kind === kind);
  const update = (list: Action[]) => onChange(kind, list);
  const set = (i: number, patch: Partial<Action>) => update(mine.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const singular = ACTION_KIND_LABELS[kind].replace(/s$/, '').toLowerCase();
  const canRecharge = kind !== 'legendary';

  return (
    <Section title={ACTION_KIND_LABELS[kind]}>
      {mine.map((a, i) => (
        <div key={a.id} className="flex flex-col gap-2 border-l-2 border-stone-700 pl-3">
          <div className="flex items-center gap-2">
            <TextInput
              value={a.name}
              placeholder="Name, e.g. Fire Breath"
              onChange={(e) => set(i, { name: e.target.value })}
              className="flex-1 font-semibold"
            />
            <RowControls
              index={i}
              count={mine.length}
              onMove={(to) => update(move(mine, i, to))}
              onRemove={() => update(mine.filter((_, j) => j !== i))}
            />
          </div>
          <TextArea
            value={a.description}
            placeholder="Description, e.g. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage."
            onChange={(e) => set(i, { description: e.target.value })}
          />
          {canRecharge && (
            <label className="flex w-fit items-center gap-2 text-xs text-stone-400">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={!!a.recharge}
                onChange={(e) => {
                  const { recharge: _drop, ...rest } = a;
                  update(mine.map((x, j) => (j === i ? (e.target.checked ? { ...rest, recharge: DEFAULT_RECHARGE.threshold } : rest) : x)));
                }}
              />
              Recharges
            </label>
          )}
          {a.recharge && <RechargeEditor recharge={a.recharge} onChange={(recharge) => set(i, { recharge })} />}
        </div>
      ))}
      <div>
        <Button onClick={() => update([...mine, { id: newId(), name: '', description: '', kind }])}>
          + Add {singular}
        </Button>
      </div>
    </Section>
  );
}

function DamageChips<T extends string>({
  value,
  onChange,
  options = DAMAGE_TYPES as readonly string[] as readonly T[],
}: {
  value: T[];
  onChange: (v: T[]) => void;
  options?: readonly T[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((d) => (
        <Chip key={d} on={value.includes(d)} onClick={() => onChange(toggle(value, d))}>
          {d === NONMAGICAL ? 'nonmagical weapons (B/P/S)' : d}
        </Chip>
      ))}
    </div>
  );
}

export function CreatureEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CreatureTemplate | null>(id ? null : blankCreature);
  const [original, setOriginal] = useState<string>('');
  const [notFound, setNotFound] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load once (not live) so background changes don't clobber the draft.
  useEffect(() => {
    if (!id) {
      setOriginal(JSON.stringify(draft));
      return;
    }
    db.creatures.get(id).then((t) => {
      if (!t) return setNotFound(true);
      setDraft(t);
      setOriginal(JSON.stringify(t));
    });
  }, [id]);

  const dirty = draft !== null && original !== '' && JSON.stringify(draft) !== original;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const errors = useMemo(() => (draft ? validateCreature(draft) : []), [draft]);

  if (notFound) return <p className="text-stone-400">That stat block doesn't exist.</p>;
  if (!draft) return null;

  const t = draft;
  const set = (patch: Partial<CreatureTemplate>) => setDraft({ ...t, ...patch });
  const setActions = (kind: ActionKind, list: Action[]) => {
    // Keep each kind's block in canonical order: actions, bonus, reactions, legendary.
    const others = t.actions.filter((a) => a.kind !== kind);
    const all = [...others, ...list];
    set({ actions: ACTION_KINDS.flatMap((k) => all.filter((a) => a.kind === k)) });
  };
  const stdXP = xpForCR(t.cr);
  const avg = averageHP(t.hitDice);
  const conBonus = conHitDiceBonus(t);
  const crOptions = CR_VALUES.includes(t.cr) ? CR_VALUES : [t.cr, ...CR_VALUES];

  const save = async () => {
    setShowErrors(true);
    if (errors.length) return;
    setSaving(true);
    const toSave = { ...t, name: t.name.trim() };
    await saveCreature(toSave);
    setOriginal(JSON.stringify(toSave));
    navigate(`/bestiary/${t.id}`, { replace: true });
  };

  const cancel = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate(id ? `/bestiary/${id}` : '/bestiary');
  };

  return (
    <>
      <PageHeader title={id ? 'Edit stat block' : 'New stat block'} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <form
          className="flex flex-col gap-4 pb-24"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Section title="Header">
            <Field label="Name">
              <TextInput value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Goblin" autoFocus={!id} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Size">
                <Select value={t.size} onChange={(e) => setDraft(changeSize(t, e.target.value as Size))}>
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Type">
                <TextInput value={t.type} onChange={(e) => set({ type: e.target.value })} placeholder="humanoid (goblinoid)" />
              </Field>
              <Field label="Alignment">
                <TextInput value={t.alignment} onChange={(e) => set({ alignment: e.target.value })} placeholder="neutral evil" />
              </Field>
            </div>
          </Section>

          <Section title="Defenses">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Armor Class">
                <NumberField value={t.ac} min={0} max={40} onChange={(ac) => set({ ac })} />
              </Field>
              <Field label="AC note" className="col-span-1 sm:col-span-3">
                <TextInput value={t.acNote ?? ''} onChange={(e) => set({ acNote: e.target.value })} placeholder="leather armor, shield" />
              </Field>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Hit dice">
                <div className="flex items-center gap-1.5">
                  <NumberField
                    aria-label="Hit dice count"
                    value={t.hitDice.count}
                    min={1}
                    max={999}
                    onChange={(count) => setDraft(changeHitDice(t, { ...t.hitDice, count }))}
                    className="w-16 text-center"
                  />
                  <Select
                    aria-label="Die type"
                    value={t.hitDice.dieType}
                    onChange={(e) => setDraft(changeHitDice(t, { ...t.hitDice, dieType: e.target.value as DieType }))}
                  >
                    {DIE_TYPES.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </Select>
                  <span className="text-stone-500">+</span>
                  <NumberField
                    aria-label="Hit dice bonus"
                    value={t.hitDice.bonus}
                    min={-999}
                    max={9999}
                    onChange={(bonus) => setDraft(changeHitDice(t, { ...t.hitDice, bonus }))}
                    className="w-20 text-center"
                  />
                </div>
              </Field>
              {conBonus !== t.hitDice.bonus && (
                <Button onClick={() => setDraft(changeHitDice(t, { ...t.hitDice, bonus: conBonus }))}>
                  Bonus from CON ({formatMod(conBonus)})
                </Button>
              )}
              <Field label="Max HP" hint={t.maxHP === avg ? '(average)' : undefined}>
                <NumberField value={t.maxHP} min={1} max={99999} onChange={(maxHP) => set({ maxHP })} className="w-24" />
              </Field>
              {t.maxHP !== avg && <Button onClick={() => set({ maxHP: avg })}>Use average ({avg})</Button>}
            </div>
            <p className="-mt-1 text-xs text-stone-500">
              The die defaults from size. Staging a combat can use this max HP or roll the hit dice per creature.
            </p>
            <Field label="Speed">
              <TextInput value={t.speed} onChange={(e) => set({ speed: e.target.value })} placeholder="30 ft., fly 60 ft." />
            </Field>
            <Field label="Damage vulnerabilities">
              <DamageChips value={t.damageVulnerabilities} onChange={(v) => set({ damageVulnerabilities: v })} />
            </Field>
            <Field label="Damage resistances">
              <DamageChips value={t.damageResistances} options={DEFENSE_TYPES} onChange={(v) => set({ damageResistances: v })} />
            </Field>
            <Field label="Damage immunities">
              <DamageChips value={t.damageImmunities} options={DEFENSE_TYPES} onChange={(v) => set({ damageImmunities: v })} />
            </Field>
            <Field label="Condition immunities">
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => (
                  <Chip
                    key={c}
                    on={t.conditionImmunities.includes(c)}
                    onClick={() => set({ conditionImmunities: toggle(t.conditionImmunities, c) })}
                  >
                    {c}
                  </Chip>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="Abilities">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {ABILITIES.map((a) => (
                <Field key={a} label={a.toUpperCase()} hint={formatMod(abilityMod(t.abilities[a]))}>
                  <NumberField
                    value={t.abilities[a]}
                    min={1}
                    max={30}
                    onChange={(n) => set({ abilities: { ...t.abilities, [a]: n } })}
                    className="text-center"
                  />
                </Field>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Saving throws">
                <TextInput value={t.saves} onChange={(e) => set({ saves: e.target.value })} placeholder="Dex +4, Wis +2" />
              </Field>
              <Field label="Skills">
                <TextInput value={t.skills} onChange={(e) => set({ skills: e.target.value })} placeholder="Stealth +6" />
              </Field>
              <Field label="Senses">
                <TextInput value={t.senses} onChange={(e) => set({ senses: e.target.value })} placeholder="darkvision 60 ft., passive Perception 9" />
              </Field>
              <Field label="Languages">
                <TextInput value={t.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="Common, Goblin" />
              </Field>
            </div>
          </Section>

          <Section title="Challenge">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="CR">
                <Select value={t.cr} onChange={(e) => setDraft(changeCR(t, e.target.value))}>
                  {crOptions.map((cr) => (
                    <option key={cr}>{cr}</option>
                  ))}
                </Select>
              </Field>
              <Field label="XP" hint={stdXP !== undefined && t.xp !== stdXP ? '(custom)' : undefined}>
                <NumberField value={t.xp} min={0} max={9999999} onChange={(xp) => set({ xp })} className="w-28" />
              </Field>
              {stdXP !== undefined && t.xp !== stdXP && (
                <Button onClick={() => set({ xp: stdXP })}>Use standard ({stdXP.toLocaleString()})</Button>
              )}
            </div>
          </Section>

          <Section title="Traits">
            <TraitsEditor traits={t.traits} onChange={(traits) => set({ traits })} />
          </Section>

          {ACTION_KINDS.map((k) => (
            <ActionsEditor key={k} kind={k} actions={t.actions} onChange={setActions} />
          ))}

          <Section title="Notes">
            <TextArea value={t.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Tactics, loot, source…" rows={4} />
          </Section>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3 px-4 py-3">
              {showErrors && errors.length > 0 && (
                <ul className="mr-auto text-xs text-red-400">
                  {errors.slice(0, 3).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {errors.length > 3 && <li>…and {errors.length - 3} more</li>}
                </ul>
              )}
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                Save stat block
              </Button>
            </div>
          </div>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-10rem)] overflow-y-auto">
            <p className="mb-2 text-xs uppercase tracking-wider text-stone-500">Preview</p>
            <StatBlock creature={{ ...t, name: t.name || 'Unnamed creature' }} />
          </div>
        </aside>
      </div>
    </>
  );
}
