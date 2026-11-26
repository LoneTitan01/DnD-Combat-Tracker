import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, PageHeader } from '../../components/ui';
import { db, saveItem } from '../../db';
import { blankItem, validateItem, withCategory } from '../../logic';
import { ITEM_CATEGORIES, type Item, type ItemCategory } from '../../models';
import { ItemCard } from './ItemCard';
import { ItemForm } from './ItemForm';

/** A new item starts in the category the list was showing (`?category=`), or as adventuring gear. */
function newItem(category: string | null): Item {
  const c = (ITEM_CATEGORIES as readonly string[]).includes(category ?? '') ? (category as ItemCategory) : 'gear';
  return withCategory(blankItem(c), c);
}

export function ItemEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Item | null>(() => (id ? null : newItem(params.get('category'))));
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
    db.items.get(id).then((i) => {
      if (!i) return setNotFound(true);
      setDraft(i);
      setOriginal(JSON.stringify(i));
    });
  }, [id]);

  const dirty = draft !== null && original !== '' && JSON.stringify(draft) !== original;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const errors = useMemo(() => (draft ? validateItem(draft) : []), [draft]);

  if (notFound) return <p className="text-stone-400">That item doesn't exist.</p>;
  if (!draft) return null;

  const item = draft;

  const save = async () => {
    setShowErrors(true);
    if (errors.length) return;
    setSaving(true);
    const toSave = { ...item, name: item.name.trim() };
    await saveItem(toSave);
    setOriginal(JSON.stringify(toSave));
    navigate(`/items/${item.id}`, { replace: true });
  };

  const cancel = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate(id ? `/items/${id}` : '/items');
  };

  return (
    <>
      <PageHeader title={id ? 'Edit item' : 'New item'} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form
          className="flex flex-col gap-4 pb-24"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <ItemForm value={item} onChange={setDraft} autoFocusName={!id} />

          <div className="fixed bottom-0 left-[var(--nav-width,0px)] right-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
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
                Save item
              </Button>
            </div>
          </div>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <p className="mb-2 text-xs uppercase tracking-wider text-stone-500">Preview</p>
            <article className="rounded-lg border border-amber-900/60 bg-stone-900 p-5 shadow-lg">
              <ItemCard item={{ ...item, name: item.name || 'Unnamed item' }} />
            </article>
          </div>
        </aside>
      </div>
    </>
  );
}
