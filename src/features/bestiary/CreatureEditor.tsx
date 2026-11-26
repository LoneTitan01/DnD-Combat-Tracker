import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, PageHeader } from '../../components/ui';
import { db, saveCreature } from '../../db';
import { blankCreature, validateCreature } from '../../logic';
import type { CreatureTemplate } from '../../models';
import { CreatureForm } from './CreatureForm';
import { StatBlock } from './StatBlock';

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
          <CreatureForm value={t} onChange={setDraft} autoFocusName={!id} />

          <div className="fixed bottom-0 left-[var(--nav-width,0px)] right-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
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
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <p className="mb-2 text-xs uppercase tracking-wider text-stone-500">Preview</p>
            <StatBlock creature={{ ...t, name: t.name || 'Unnamed creature' }} />
          </div>
        </aside>
      </div>
    </>
  );
}
