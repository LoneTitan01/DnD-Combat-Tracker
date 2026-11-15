import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Card, Field, PageHeader, Select, TextArea, TextInput } from '../../components/ui';
import { db, saveSpell } from '../../db';
import { blankSpell, spellLevelLabel, validateSpell } from '../../logic';
import { SPELL_SCHOOLS, type Spell } from '../../models';
import { SpellCard } from './SpellCard';

export function SpellEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Spell | null>(id ? null : blankSpell);
  const [original, setOriginal] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load once (not live) so background changes don't clobber the draft.
  useEffect(() => {
    if (!id) {
      setOriginal(JSON.stringify(draft));
      return;
    }
    db.spells.get(id).then((s) => {
      if (!s) return setNotFound(true);
      setDraft(s);
      setOriginal(JSON.stringify(s));
    });
  }, [id]);

  const dirty = draft !== null && original !== '' && JSON.stringify(draft) !== original;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const errors = useMemo(() => (draft ? validateSpell(draft) : []), [draft]);

  if (notFound) return <p className="text-stone-400">That spell doesn't exist.</p>;
  if (!draft) return null;

  const s = draft;
  const set = (patch: Partial<Spell>) => setDraft({ ...s, ...patch });
  const schoolIsStandard = (SPELL_SCHOOLS as readonly string[]).includes(s.school);

  const save = async () => {
    setShowErrors(true);
    if (errors.length) return;
    setSaving(true);
    const toSave = { ...s, name: s.name.trim() };
    await saveSpell(toSave);
    setOriginal(JSON.stringify(toSave));
    navigate(`/spells/${s.id}`, { replace: true });
  };

  const cancel = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate(id ? `/spells/${id}` : '/spells');
  };

  return (
    <>
      <PageHeader title={id ? 'Edit spell' : 'New spell'} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form
          className="flex flex-col gap-4 pb-24"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Card className="flex flex-col gap-3">
            <Field label="Name">
              <TextInput value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Fireball" autoFocus={!id} />
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

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3 px-4 py-3">
              {showErrors && errors.length > 0 && (
                <ul className="mr-auto text-xs text-red-400">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                Save spell
              </Button>
            </div>
          </div>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-10rem)] overflow-y-auto">
            <p className="mb-2 text-xs uppercase tracking-wider text-stone-500">Preview</p>
            <article className="rounded-lg border border-sky-900/60 bg-stone-900 p-5 shadow-lg">
              <SpellCard spell={{ ...s, name: s.name || 'Unnamed spell' }} />
            </article>
          </div>
        </aside>
      </div>
    </>
  );
}
