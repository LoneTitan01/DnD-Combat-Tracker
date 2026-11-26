import { Card, Field, NumberField, Select, TextArea, TextInput } from '../../components/ui';
import { ARMOR_TYPE_LABELS, armorOf, ITEM_CATEGORY_LABELS, TOOL_TYPE_LABELS, toolOf, weaponOf, withCategory } from '../../logic';
import {
  ARMOR_TYPES,
  DAMAGE_TYPES,
  ITEM_CATEGORIES,
  TOOL_TYPES,
  WEAPON_CLASSES,
  WEAPON_RANGES,
  type ArmorDetails,
  type ArmorType,
  type DamageType,
  type Item,
  type ItemCategory,
  type ToolType,
  type WeaponClass,
  type WeaponDetails,
  type WeaponRange,
} from '../../models';

function WeaponFields({ value: w, onChange }: { value: WeaponDetails; onChange: (w: WeaponDetails) => void }) {
  const set = (patch: Partial<WeaponDetails>) => onChange({ ...w, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Weapon class">
        <Select value={w.class} onChange={(e) => set({ class: e.target.value as WeaponClass })} className="capitalize">
          {WEAPON_CLASSES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Melee or ranged">
        <Select value={w.range} onChange={(e) => set({ range: e.target.value as WeaponRange })} className="capitalize">
          {WEAPON_RANGES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Damage">
        <TextInput value={w.damage} onChange={(e) => set({ damage: e.target.value })} placeholder="1d8" />
      </Field>
      <Field label="Damage type">
        <Select value={w.damageType} onChange={(e) => set({ damageType: e.target.value as DamageType })} className="capitalize">
          {DAMAGE_TYPES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Properties" className="sm:col-span-2">
        <TextInput
          value={w.properties}
          onChange={(e) => set({ properties: e.target.value })}
          placeholder="Finesse, light, thrown (range 20/60)"
        />
      </Field>
    </div>
  );
}

function ArmorFields({ value: a, onChange }: { value: ArmorDetails; onChange: (a: ArmorDetails) => void }) {
  const set = (patch: Partial<ArmorDetails>) => onChange({ ...a, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Armor type">
        <Select value={a.type} onChange={(e) => set({ type: e.target.value as ArmorType })}>
          {ARMOR_TYPES.map((x) => (
            <option key={x} value={x}>
              {ARMOR_TYPE_LABELS[x]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Armor Class">
        <TextInput
          value={a.ac}
          onChange={(e) => set({ ac: e.target.value })}
          placeholder={a.type === 'shield' ? '+2' : '11 + Dex modifier'}
        />
      </Field>
      <Field label="Strength requirement" hint="0 = none">
        <NumberField value={a.strength} min={0} max={30} onChange={(strength) => set({ strength })} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-stone-300">
        <input
          type="checkbox"
          className="accent-amber-500"
          checked={a.stealthDisadvantage}
          onChange={(e) => set({ stealthDisadvantage: e.target.checked })}
        />
        Disadvantage on Stealth
      </label>
    </div>
  );
}

/** Every editable field of an item. Controlled: the page owns the draft. */
export function ItemForm({
  value: i,
  onChange,
  autoFocusName = false,
}: {
  value: Item;
  onChange: (i: Item) => void;
  autoFocusName?: boolean;
}) {
  const set = (patch: Partial<Item>) => onChange({ ...i, ...patch });
  return (
    <Card className="flex flex-col gap-3">
      <Field label="Name">
        <TextInput value={i.name} onChange={(e) => set({ name: e.target.value })} placeholder="Longsword" autoFocus={autoFocusName} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category">
          <Select value={i.category} onChange={(e) => onChange(withCategory(i, e.target.value as ItemCategory))}>
            {ITEM_CATEGORIES.map((x) => (
              <option key={x} value={x}>
                {ITEM_CATEGORY_LABELS[x]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cost">
          <TextInput value={i.cost} onChange={(e) => set({ cost: e.target.value })} placeholder="15 gp" />
        </Field>
        <Field label="Weight">
          <TextInput value={i.weight} onChange={(e) => set({ weight: e.target.value })} placeholder="3 lb." />
        </Field>
      </div>
      {i.category === 'weapon' && <WeaponFields value={weaponOf(i)} onChange={(weapon) => set({ weapon })} />}
      {i.category === 'armor' && <ArmorFields value={armorOf(i)} onChange={(armor) => set({ armor })} />}
      {i.category === 'tool' && (
        <Field label="Tool type">
          <Select value={toolOf(i).type} onChange={(e) => set({ tool: { type: e.target.value as ToolType } })}>
            {TOOL_TYPES.map((x) => (
              <option key={x} value={x}>
                {TOOL_TYPE_LABELS[x]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Description">
        <TextArea value={i.description} onChange={(e) => set({ description: e.target.value })} rows={6} />
      </Field>
    </Card>
  );
}
