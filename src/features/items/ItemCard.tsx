import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { db } from '../../db';
import { armorOf, bonusLine, effectName, effectUses, itemSubtitle, MAGIC_EFFECT_LABELS, magicBonus, magicOf, weaponDamage, weaponOf } from '../../logic';
import type { Item, MagicEffect, Spell } from '../../models';
import { SpellMention } from '../spells/SpellMention';

function Line({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p>
      <span className="font-semibold text-amber-200">{label}:</span> {children}
    </p>
  );
}

function Effect({ effect: e, spell }: { effect: MagicEffect; spell?: Spell }) {
  const name = effectName(e, () => spell?.name) || MAGIC_EFFECT_LABELS[e.kind];
  const uses = effectUses(e);
  const tag = [e.kind === 'passive' ? '' : MAGIC_EFFECT_LABELS[e.kind], uses].filter(Boolean).join(', ');
  // A spell effect without its own name is headed by the spell itself.
  const spellHeading = e.kind === 'spell' && spell && !e.name.trim();
  return (
    <p className="mt-2">
      <span className="font-semibold italic text-violet-200">{spellHeading ? <SpellMention spell={spell} /> : name}.</span>
      {tag && <span className="ml-1 text-xs text-stone-400">({tag})</span>}{' '}
      {e.kind === 'spell' && spell && !spellHeading && (
        <>
          Casts <SpellMention spell={spell} />.{' '}
        </>
      )}
      <span className="whitespace-pre-line">{e.description}</span>
    </p>
  );
}

/** An item's full description, printed-style. Used on its own page and as the editor's preview. */
export function ItemCard({ item: i }: { item: Item }) {
  const weapon = i.category === 'weapon' ? weaponOf(i) : null;
  const armor = i.category === 'armor' ? armorOf(i) : null;
  const magic = magicOf(i);
  const spellIds = (magic?.effects ?? []).flatMap((e) => (e.spellId ? [e.spellId] : []));
  const spellKey = spellIds.join(',');
  const spells = useLiveQuery(
    async () => (spellIds.length ? (await db.spells.bulkGet(spellIds)).filter((s): s is Spell => !!s) : []),
    [spellKey],
  );
  return (
    <div className="text-sm leading-relaxed text-stone-300">
      <h3 className="font-display text-2xl font-bold text-amber-300">{i.name}</h3>
      <p className="mb-2 italic text-stone-400">{itemSubtitle(i)}</p>
      {weapon && (
        <>
          <Line label="Damage">{weaponDamage(weapon, magicBonus(i))}</Line>
          <Line label="Properties">{weapon.properties}</Line>
        </>
      )}
      {armor && (
        <>
          <Line label="Armor Class">{armor.ac}</Line>
          <Line label="Strength">{armor.strength ? `Str ${armor.strength}` : ''}</Line>
          <Line label="Stealth">{armor.stealthDisadvantage ? 'Disadvantage' : ''}</Line>
        </>
      )}
      <Line label="Magic bonus">{bonusLine(i)}</Line>
      <Line label="Cost">{i.cost}</Line>
      <Line label="Weight">{i.weight}</Line>
      {i.description && <p className="mt-2 whitespace-pre-line">{i.description}</p>}
      {magic?.effects.map((e) => (
        <Effect key={e.id} effect={e} spell={spells?.find((s) => s.id === e.spellId)} />
      ))}
    </div>
  );
}
