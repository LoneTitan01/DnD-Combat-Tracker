import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, PageHeader } from '../../components/ui';
import { db, saveSpell } from '../../db';
import { blankSpell, validateSpell } from '../../logic';
import type { Spell } from '../../models';
import { SpellCard } from './SpellCard';
import { SpellForm } from './SpellForm';

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
          <SpellForm value={s} onChange={setDraft} autoFocusName={!id} />

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
