import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, Card, Chip, Field, NumberField, Select, TextArea, TextInput } from '../../components/ui';
import { db } from '../../db';
import {
  ACTION_KIND_LABELS,
  CR_VALUES,
  abilityMod,
  averageHP,
  changeCR,
  changeHitDice,
  changeSize,
  conHitDiceBonus,
  filterSpells,
  formatMod,
  DEFAULT_SPELL_USAGE,
  REST_LABELS,
  linkedSpells,
  newId,
  SPELL_RESOURCE_LABELS,
  setLinkedSpells,
  setSpellResource,
  setSpellSlots,
  setSpellUsage,
  slotLevelLabel,
  spellResourceOf,
  spellSlotsOf,
  spellUsageOf,
  spellLevelLabel,
  suggestedSpells,
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
  REST_TYPES,
  SIZES,
  SPELL_RESOURCES,
  type Action,
  type ActionKind,
  type CreatureTemplate,
  type DieType,
  type Recharge,
  type RestType,
  type Size,
  type Spell,
  type Trait,
} from '../../models';
import { SpellMention } from '../spells/SpellMention';

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

/** One linked spell: unlink it, or limit how often it can be cast between rests. */
function LinkedSpellRow({
  creature,
  spell,
  onChange,
  onUnlink,
}: {
  creature: CreatureTemplate;
  spell: Spell;
  onChange: (t: CreatureTemplate) => void;
  onUnlink: () => void;
}) {
  const usesSlots = spellResourceOf(creature) === 'slots';
  const usage = usesSlots ? undefined : spellUsageOf(creature, spell.id);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-sky-800/70 bg-sky-950/30 px-2.5 py-1.5 text-sm">
      <span className="min-w-32 flex-1">
        <SpellMention spell={spell} />
        <span className="ml-2 text-xs text-stone-500">{spellLevelLabel(spell.level)}</span>
      </span>
      {!usesSlots && (
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          <input
            type="checkbox"
            checked={!!usage}
            onChange={(e) => onChange(setSpellUsage(creature, spell.id, e.target.checked ? DEFAULT_SPELL_USAGE : null))}
          />
          Limited uses
        </label>
      )}
      {usage && (
        <span className="flex items-center gap-1.5 text-xs text-stone-400">
          <NumberField
            aria-label={`Uses of ${spell.name}`}
            value={usage.uses}
            min={1}
            max={99}
            onChange={(uses) => onChange(setSpellUsage(creature, spell.id, { ...usage, uses }))}
            className="w-14 px-1 py-0.5 text-center text-xs"
          />
          per
          <Select
            aria-label={`${spell.name} refreshes on`}
            value={usage.per}
            onChange={(e) => onChange(setSpellUsage(creature, spell.id, { ...usage, per: e.target.value as RestType }))}
            className="py-0.5 text-xs"
          >
            {REST_TYPES.map((r) => (
              <option key={r} value={r}>
                {REST_LABELS[r]}
              </option>
            ))}
          </Select>
        </span>
      )}
      <button
        type="button"
        aria-label={`Unlink ${spell.name}`}
        className="rounded-full px-1 text-stone-500 hover:text-stone-100"
        onClick={onUnlink}
      >
        ✕
      </button>
    </li>
  );
}

/**
 * Picks how the creature pays for spells: limits on specific spells, or spell slots by level
 * (with a count for each level). Whichever is chosen is what combat tracks.
 */
function SpellResourceEditor({
  creature,
  onChange,
}: {
  creature: CreatureTemplate;
  onChange: (t: CreatureTemplate) => void;
}) {
  const resource = spellResourceOf(creature);
  const slots = spellSlotsOf(creature);
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Track spells by" className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-stone-400">Track spells by:</span>
        {SPELL_RESOURCES.map((r) => (
          <Chip key={r} on={resource === r} onClick={() => onChange(setSpellResource(creature, r))}>
            {SPELL_RESOURCE_LABELS[r]}
          </Chip>
        ))}
      </div>
      {resource === 'slots' && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs text-stone-500">
            Slots per long rest at each level. Combat tracks slots instead of per-spell uses.
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {slots.map((n, i) => (
              <label key={i} className="flex flex-col items-center gap-0.5 text-xs text-stone-400">
                {ORDINAL_LEVELS[i]}
                <NumberField
                  aria-label={`${slotLevelLabel(i + 1)} slots`}
                  value={n}
                  min={0}
                  max={99}
                  onChange={(count) => onChange(setSpellSlots(creature, i + 1, count))}
                  className="w-12 px-1 py-0.5 text-center text-xs"
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

const ORDINAL_LEVELS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/**
 * Links spells from the spell list; their names in traits and actions then show the spell on hover.
 * Linked spells can be limited to so many casts per short or long rest, tracked in combat.
 */
function SpellsEditor({ creature, onChange }: { creature: CreatureTemplate; onChange: (t: CreatureTemplate) => void }) {
  const all = useLiveQuery(() => db.spells.toArray());
  const [query, setQuery] = useState('');
  if (!all) return null;
  const ids = creature.spellIds ?? [];
  const linked = linkedSpells(creature, all);
  const suggested = suggestedSpells(creature, all);
  const q = query.trim();
  const matches = q ? filterSpells(all, { query: q }).filter((s) => !ids.includes(s.id)).slice(0, 8) : [];
  const link = (next: string[]) => onChange(setLinkedSpells(creature, next));
  const add = (more: Spell[]) => link([...ids, ...more.map((s) => s.id).filter((id) => !ids.includes(id))]);

  if (all.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        The spell list is empty.{' '}
        <Link to="/spells" className="text-amber-400 hover:underline">
          Add or import spells
        </Link>{' '}
        to link them here, so hovering a spell's name in the stat block shows what it does.
      </p>
    );
  }
  return (
    <>
      <p className="-mt-1 text-xs text-stone-500">
        Linked spells named in a trait or action (e.g. a Spellcasting trait) show their description on hover. Linked
        spells that aren't named anywhere are listed in a Spells entry.{' '}
        {spellResourceOf(creature) === 'slots'
          ? 'Combat shows the spell slots left, with linked spells listed by level.'
          : 'Spells with limited uses get a tracker in combat.'}
      </p>
      {linked.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Linked spells">
          {linked.map((s) => (
            <LinkedSpellRow
              key={s.id}
              creature={creature}
              spell={s}
              onChange={onChange}
              onUnlink={() => link(ids.filter((id) => id !== s.id))}
            />
          ))}
        </ul>
      )}
      {suggested.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
          Named in the text:
          {suggested.map((s) => (
            <Chip key={s.id} on={false} onClick={() => add([s])}>
              + {s.name}
            </Chip>
          ))}
          {suggested.length > 1 && (
            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => add(suggested)}>
              Link all
            </Button>
          )}
        </div>
      )}
      <div>
        <TextInput
          type="search"
          aria-label="Find a spell to link"
          placeholder="Find a spell to link…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches[0]) {
                add([matches[0]]);
                setQuery('');
              }
            }
          }}
          className="w-full"
        />
        {q && (
          <ul className="mt-1 rounded-md border border-stone-800 bg-stone-950/60" aria-label="Matching spells">
            {matches.length === 0 && <li className="px-3 py-1.5 text-xs text-stone-500">No unlinked spells match.</li>}
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between px-3 py-1.5 text-left text-sm hover:bg-stone-800"
                  onClick={() => {
                    add([s]);
                    setQuery('');
                  }}
                >
                  <span>Link {s.name}</span>
                  <span className="text-xs text-stone-500">{spellLevelLabel(s.level)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Every editable section of a stat block. Controlled: the page owns the draft. Used by the editor
 * and by the bulk-add review carousel.
 */
export function CreatureForm({
  value: t,
  onChange: setDraft,
  autoFocusName = false,
}: {
  value: CreatureTemplate;
  onChange: (t: CreatureTemplate) => void;
  autoFocusName?: boolean;
}) {
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

  return (
    <>
      <Section title="Header">
        <Field label="Name">
          <TextInput value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Goblin" autoFocus={autoFocusName} />
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

      <Section title="Spells">
        <SpellResourceEditor creature={t} onChange={setDraft} />
        <SpellsEditor creature={t} onChange={setDraft} />
      </Section>

      <Section title="Notes">
        <TextArea value={t.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Tactics, loot, source…" rows={4} />
      </Section>
    </>
  );
}
