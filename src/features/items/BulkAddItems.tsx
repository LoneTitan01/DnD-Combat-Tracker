import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveItem } from '../../db';
import { parseItemText, splitItemTable, splitItemText, validateItem } from '../../logic';
import { BulkAdd } from '../bulk/BulkAdd';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';

const PLACEHOLDER = `Longsword
Martial Melee Weapon
Cost: 15 gp
Weight: 3 lb.
Damage: 1d8 slashing
Properties: Versatile (1d10)

…or a table, one item per row:
Club 1 sp 1d4 bludgeoning 2 lb. Light
Dagger 2 gp 1d4 piercing 1 lb. Finesse, light, thrown (range 20/60)`;

const TABLE_PLACEHOLDER = `Name Cost Damage Weight Properties
Simple Melee Weapons
Club 1 sp 1d4 bludgeoning 2 lb. Light
Dagger 2 gp 1d4 piercing 1 lb. Finesse, light, thrown (range 20/60)
Adventuring Gear
Torch 1 cp 1 lb.
Rope, hempen (50 feet) 1 gp 10 lb.`;

export function BulkAddItems() {
  const items = useLiveQuery(() => db.items.toArray());
  return (
    <BulkAdd
      title="Bulk add items"
      noun="item"
      nounPlural="items"
      backTo="/items"
      backLabel="Items"
      placeholder={PLACEHOLDER}
      intro={
        <>
          Paste one item per box, or a whole equipment table with one item per row, copied from a PDF, a website or your
          own notes. Each item is read as well as it can be, including whether it's a weapon, armor, a tool or adventuring
          gear; when that isn't clear you'll be asked. Then you can check and fix every one before adding it.
        </>
      }
      split={splitItemText}
      table={{
        split: splitItemTable,
        placeholder: TABLE_PLACEHOLDER,
        intro: (
          <>
            Paste a table with one item per row. Every row becomes its own item and is read the same way as a pasted item,
            including whether it's a weapon, armor, a tool or adventuring gear. A row of column names is skipped, and a
            heading such as "Martial Melee Weapons" or "Light Armor" sets the kind of the rows under it.
          </>
        ),
      }}
      parse={parseItemText}
      validate={validateItem}
      save={(i) => saveItem(i)}
      viewPath={(i) => `/items/${i.id}`}
      existingNames={(items ?? []).map((i) => i.name)}
      form={(i, onChange) => <ItemForm value={i} onChange={onChange} />}
      preview={(i) => (
        <article className="rounded-lg border border-amber-900/60 bg-stone-900 p-5 shadow-lg">
          <ItemCard item={{ ...i, name: i.name || 'Unnamed item' }} />
        </article>
      )}
      gridClass="lg:grid-cols-[minmax(0,1fr)_380px]"
    />
  );
}
