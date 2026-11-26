import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, Field, NumberField, Select, TextArea, TextInput } from '../../components/ui';
import { db } from '../../db';
import {
  blankMagicEffect,
  filterSpells,
  MAGIC_EFFECT_LABELS,
  MAX_MAGIC_BONUS,
  magicOf,
  spellLevelLabel,
  withMagic,
} from '../../logic';
import {
  ITEM_RARITIES,
  MAGIC_EFFECT_KINDS,
  type Item,
  type ItemRarity,
  type MagicDetails,
  type MagicEffect,
  type MagicEffectKind,
  type Spell,
} from '../../models';
import { SpellMention } from '../spells/SpellMention';

/** Picks the spell a spell effect casts, by searching the spell list. */
function SpellPicker({ spells, onPick }: { spells: readonly Spell[]; onPick: (s: Spell) => void }) {
  const [query, setQuery] = useState('');
  if (spells.length === 0) {
    return (
      <p className="text-xs text-stone-500">
        The spell list is empty.{' '}
        <Link to="/spells" className="text-amber-400 hover:underline">
          Add or import spells
        </Link>{' '}
        to link one, or just give the effect a name.
      </p>
    );
  }
  const q = query.trim();
  const matches = q ? filterSpells(spells, { query: q }).slice(0, 8) : [];
  return (
    <div className="flex flex-col gap-1.5">
      <TextInput
        type="search"
        aria-label="Find a spell"
        placeholder="Find a spell…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (matches[0]) onPick(matches[0]);
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Matching spells">
          {matches.map((s) => (
            <li key={s.id}>
              <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => onPick(s)}>
                {s.name} <span className="text-stone-500">{spellLevelLabel(s.level)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {q && matches.length === 0 && <p className="text-xs text-stone-500">No spells match.</p>}
    </div>
  );
}

function EffectRow({
  effect: e,
  spells,
  onChange,
  onRemove,
}: {
  effect: MagicEffect;
  spells: readonly Spell[];
  onChange: (e: MagicEffect) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<MagicEffect>) => onChange({ ...e, ...patch });
  const spell = e.spellId ? spells.find((s) => s.id === e.spellId) : undefined;
  const label = MAGIC_EFFECT_LABELS[e.kind];
  return (
    <li className="flex flex-col gap-2 rounded-md border border-violet-900/70 bg-violet-950/20 p-3" aria-label={`${label} effect`}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Kind">
          <Select
            value={e.kind}
            onChange={(ev) => {
              const kind = ev.target.value as MagicEffectKind;
              onChange(kind === 'spell' ? { ...e, kind } : { ...e, kind, spellId: undefined });
            }}
          >
            {MAGIC_EFFECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {MAGIC_EFFECT_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Effect name" hint={e.kind === 'spell' ? 'blank = the spell’s name' : undefined} className="min-w-40 flex-1">
          <TextInput
            value={e.name}
            onChange={(ev) => set({ name: ev.target.value })}
            placeholder={e.kind === 'spell' ? (spell?.name ?? 'Fireball') : e.kind === 'passive' ? 'Fire Resistance' : 'Flame Tongue'}
          />
        </Field>
        {e.kind !== 'passive' && (
          <>
            <Field label="Uses" hint="0 = unlimited">
              <NumberField value={e.uses} min={0} max={99} onChange={(uses) => set({ uses })} className="w-20" />
            </Field>
            <Field label="Recharges">
              <TextInput value={e.recharge} onChange={(ev) => set({ recharge: ev.target.value })} placeholder="dawn" className="w-28" />
            </Field>
          </>
        )}
        <Button variant="ghost" onClick={onRemove} aria-label={`Remove ${e.name || label.toLowerCase()} effect`}>
          Remove
        </Button>
      </div>
      {e.kind === 'spell' &&
        (e.spellId ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-stone-300">
            Casts{' '}
            {spell ? <SpellMention spell={spell} /> : <span className="italic text-stone-500">a spell no longer in the spell list</span>}
            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => set({ spellId: undefined })}>
              Change spell
            </Button>
          </p>
        ) : (
          <SpellPicker spells={spells} onPick={(s) => set({ spellId: s.id })} />
        ))}
      <Field label="Effect description">
        <TextArea
          value={e.description}
          onChange={(ev) => set({ description: ev.target.value })}
          rows={2}
          placeholder={e.kind === 'spell' ? 'Save DC 15. Expends 1 charge.' : ''}
        />
      </Field>
    </li>
  );
}

/** The magic section of the item editor: whether it's magical, its rarity, attunement, bonus and effects. */
export function MagicFields({ value: i, onChange }: { value: Item; onChange: (i: Item) => void }) {
  const spells = useLiveQuery(() => db.spells.toArray()) ?? [];
  const m = magicOf(i);
  const setMagic = (patch: Partial<MagicDetails>) => m && onChange({ ...i, magic: { ...m, ...patch } });
  const setEffects = (effects: MagicEffect[]) => setMagic({ effects });
  const hasBonus = i.category === 'weapon' || i.category === 'armor';

  return (
    <Card className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-stone-200">
        <input type="checkbox" className="accent-violet-500" checked={!!m} onChange={(e) => onChange(withMagic(i, e.target.checked))} />
        Magic item
      </label>
      {m && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Rarity">
              <Select value={m.rarity} onChange={(e) => setMagic({ rarity: e.target.value as ItemRarity })} className="capitalize">
                {ITEM_RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {hasBonus && (
              <Field label="Enchantment bonus" hint={i.category === 'weapon' ? '+N to attack and damage' : '+N to AC'}>
                <NumberField value={m.bonus} min={0} max={MAX_MAGIC_BONUS} onChange={(bonus) => setMagic({ bonus })} />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input
                type="checkbox"
                className="accent-violet-500"
                checked={m.attunement}
                onChange={(e) => setMagic({ attunement: e.target.checked })}
              />
              Requires attunement
            </label>
            {m.attunement && (
              <TextInput
                aria-label="Attunement by"
                value={m.attunementBy}
                onChange={(e) => setMagic({ attunementBy: e.target.value })}
                placeholder="by a wizard (optional)"
                className="min-w-48 flex-1"
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-stone-400">
              Effects: spells it lets the wielder cast, actions they can take with it, and passive effects.
            </p>
            {m.effects.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Magic effects">
                {m.effects.map((e, n) => (
                  <EffectRow
                    key={e.id}
                    effect={e}
                    spells={spells}
                    onChange={(next) => setEffects(m.effects.map((x, k) => (k === n ? next : x)))}
                    onRemove={() => setEffects(m.effects.filter((_, k) => k !== n))}
                  />
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {MAGIC_EFFECT_KINDS.map((k) => (
                <Button key={k} onClick={() => setEffects([...m.effects, blankMagicEffect(k)])}>
                  + {MAGIC_EFFECT_LABELS[k]}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
