import { Card, Field, Select, TextArea, TextInput } from '../../components/ui';
import { spellLevelLabel } from '../../logic';
import { SPELL_SCHOOLS, type Spell } from '../../models';

/** Every editable field of a spell. Controlled: the page owns the draft. Used by the editor and bulk add. */
export function SpellForm({
  value: s,
  onChange,
  autoFocusName = false,
}: {
  value: Spell;
  onChange: (s: Spell) => void;
  autoFocusName?: boolean;
}) {
  const set = (patch: Partial<Spell>) => onChange({ ...s, ...patch });
  const schoolIsStandard = (SPELL_SCHOOLS as readonly string[]).includes(s.school);
  return (
    <Card className="flex flex-col gap-3">
      <Field label="Name">
        <TextInput value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Fireball" autoFocus={autoFocusName} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Level">
          <Select value={s.level} onChange={(e) => set({ level: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
              <option key={l} value={l}>
                {spellLevelLabel(l)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="School">
          <Select
            value={schoolIsStandard ? s.school : '__custom'}
            onChange={(e) => set({ school: e.target.value === '__custom' ? '' : e.target.value })}
            className="capitalize"
          >
            {SPELL_SCHOOLS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
            <option value="__custom">Other…</option>
          </Select>
        </Field>
        {!schoolIsStandard && (
          <Field label="Custom school" className="sm:col-span-2">
            <TextInput value={s.school} onChange={(e) => set({ school: e.target.value })} placeholder="chronurgy" />
          </Field>
        )}
        <Field label="Casting time">
          <TextInput value={s.castingTime} onChange={(e) => set({ castingTime: e.target.value })} placeholder="1 action" />
        </Field>
        <Field label="Range">
          <TextInput value={s.range} onChange={(e) => set({ range: e.target.value })} placeholder="150 feet" />
        </Field>
        <Field label="Components">
          <TextInput
            value={s.components}
            onChange={(e) => set({ components: e.target.value })}
            placeholder="V, S, M (a tiny ball of bat guano and sulfur)"
          />
        </Field>
        <Field label="Duration">
          <TextInput value={s.duration} onChange={(e) => set({ duration: e.target.value })} placeholder="Instantaneous" />
        </Field>
      </div>
      <div className="flex gap-4 text-sm text-stone-300">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={s.concentration}
            onChange={(e) => set({ concentration: e.target.checked })}
          />
          Concentration
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-amber-500"
            checked={s.ritual}
            onChange={(e) => set({ ritual: e.target.checked })}
          />
          Ritual
        </label>
      </div>
      <Field label="Description">
        <TextArea value={s.description} onChange={(e) => set({ description: e.target.value })} rows={8} />
      </Field>
      <Field label="At higher levels">
        <TextArea
          value={s.higherLevels}
          onChange={(e) => set({ higherLevels: e.target.value })}
          placeholder="When you cast this spell using a spell slot of 4th level or higher…"
        />
      </Field>
    </Card>
  );
}
