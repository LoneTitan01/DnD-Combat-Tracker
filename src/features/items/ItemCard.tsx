import type { ReactNode } from 'react';
import { armorOf, itemSubtitle, weaponDamage, weaponOf } from '../../logic';
import type { Item } from '../../models';

function Line({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p>
      <span className="font-semibold text-amber-200">{label}:</span> {children}
    </p>
  );
}

/** An item's full description, printed-style. Used on its own page and as the editor's preview. */
export function ItemCard({ item: i }: { item: Item }) {
  const weapon = i.category === 'weapon' ? weaponOf(i) : null;
  const armor = i.category === 'armor' ? armorOf(i) : null;
  return (
    <div className="text-sm leading-relaxed text-stone-300">
      <h3 className="font-display text-2xl font-bold text-amber-300">{i.name}</h3>
      <p className="mb-2 italic text-stone-400">{itemSubtitle(i)}</p>
      {weapon && (
        <>
          <Line label="Damage">{weaponDamage(weapon)}</Line>
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
      <Line label="Cost">{i.cost}</Line>
      <Line label="Weight">{i.weight}</Line>
      {i.description && <p className="mt-2 whitespace-pre-line">{i.description}</p>}
    </div>
  );
}
