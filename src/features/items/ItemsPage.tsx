import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { nextSort, SortableHeader } from '../../components/SortableHeader';
import { Button, Card, Chip, PageHeader, TextInput } from '../../components/ui';
import { useUrlFilters } from '../../components/useUrlFilters';
import { db } from '../../db';
import { countByCategory, filterItems, ITEM_CATEGORY_LABELS, ITEM_SORTS, itemSummary, itemType, magicOf, type ItemSort } from '../../logic';
import { ITEM_CATEGORIES, type ItemCategory } from '../../models';
import { confirmAndDeleteItem, describeItemImport, downloadItems, importItemFile } from './actions';

const asSort = (v: string | null): ItemSort => (ITEM_SORTS.includes(v as ItemSort) ? (v as ItemSort) : 'name');
const asCategory = (v: string | null): ItemCategory | '' =>
  (ITEM_CATEGORIES as readonly string[]).includes(v ?? '') ? (v as ItemCategory) : '';

function Tab({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
        on ? 'border-amber-500 text-amber-300' : 'border-transparent text-stone-400 hover:text-stone-100'
      }`}
    >
      {label}{' '}
      <span className="ml-1 text-xs tabular-nums text-stone-500">{count}</span>
    </button>
  );
}

export function ItemsPage() {
  const navigate = useNavigate();
  const all = useLiveQuery(() => db.items.toArray());
  const { params, setFilter, clearFilters } = useUrlFilters();
  const query = params.get('q') ?? '';
  const category = asCategory(params.get('category'));
  const sort = asSort(params.get('sort'));
  const desc = params.get('dir') === 'desc';
  const magic = params.get('magic') === '1';
  const shown = useMemo(
    () => filterItems(all ?? [], { query, category, magic, sort, desc }),
    [all, query, category, magic, sort, desc],
  );
  const counts = useMemo(() => countByCategory(all ?? []), [all]);
  const onSort = (column: ItemSort) => {
    const next = nextSort({ sort, desc }, column);
    setFilter('sort', next.sort === 'name' ? '' : next.sort);
    setFilter('dir', next.desc ? 'desc' : '');
  };
  const sortProps = { sort, desc, onSort };
  const filtered = !!(query || category || magic);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const onImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setMessage({ text: describeItemImport(await importItemFile(file)) });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Import failed.', error: true });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <PageHeader title="Items">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void onImport(e.target.files)}
        />
        <Button onClick={() => fileInput.current?.click()}>Import JSON</Button>
        <Button
          disabled={!all?.length}
          onClick={() => void downloadItems(filtered ? shown.map((i) => i.id) : undefined)}
          title={filtered ? 'Exports the items matching the current filters' : 'Exports every item'}
        >
          {filtered ? `Export ${shown.length} shown` : 'Export all'}
        </Button>
        <Button onClick={() => navigate('/items/bulk')} title="Paste several at once, or a whole table, from a PDF, a website or your notes">
          Bulk add
        </Button>
        <Button variant="primary" onClick={() => navigate(category ? `/items/new?category=${category}` : '/items/new')}>
          New item
        </Button>
      </PageHeader>

      {message && (
        <div
          role="status"
          className={`mb-4 flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
            message.error ? 'border-red-800 bg-red-950/50 text-red-200' : 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
          }`}
        >
          {message.text}
          <button type="button" className="ml-3 text-xs opacity-70 hover:opacity-100" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Category" className="mb-4 flex overflow-x-auto border-b border-stone-800">
        <Tab on={!category} onClick={() => setFilter('category', '')} label="All" count={all?.length ?? 0} />
        {ITEM_CATEGORIES.map((c) => (
          <Tab key={c} on={category === c} onClick={() => setFilter('category', c)} label={ITEM_CATEGORY_LABELS[c]} count={counts[c]} />
        ))}
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3">
        <TextInput
          type="search"
          aria-label="Search by name"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setFilter('q', e.target.value)}
          className="min-w-48 flex-1"
        />
        <Chip on={magic} onClick={() => setFilter('magic', magic ? '' : '1')}>
          Magic items only
        </Chip>
        {filtered && (
          <Button variant="ghost" onClick={() => clearFilters(['sort', 'dir'])}>
            Clear
          </Button>
        )}
      </Card>

      {all && all.length === 0 && (
        <Card className="text-center text-sm text-stone-400">
          <p>No items yet.</p>
          <p className="mt-1">Create weapons, armor, tools and adventuring gear, or import a JSON file.</p>
        </Card>
      )}

      {all && all.length > 0 && shown.length === 0 && (
        <p className="text-sm text-stone-500">{query || magic ? 'No items match these filters.' : `No ${ITEM_CATEGORY_LABELS[category as ItemCategory].toLowerCase()} yet.`}</p>
      )}

      {shown.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-800">
                <SortableHeader column="name" label="Name" className="px-4" {...sortProps} />
                <SortableHeader column="category" label="Type" className="px-2" {...sortProps} />
                <SortableHeader column="rarity" label="Rarity" className="px-2" {...sortProps} />
                <th className="px-2 py-2 font-medium">Details</th>
                <SortableHeader column="cost" label="Cost" className="px-2" {...sortProps} />
                <SortableHeader column="weight" label="Weight" className="px-2" {...sortProps} />
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-t border-stone-800/70 hover:bg-stone-800/40">
                  <td className="px-4 py-2">
                    <Link to={`/items/${i.id}`} className="font-semibold text-stone-100 hover:text-amber-300">
                      {i.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-stone-400">{itemType(i)}</td>
                  <td className="px-2 py-2 text-violet-300">
                    {i.magic && <span className="capitalize">{magicOf(i)!.rarity}</span>}
                    {magicOf(i)?.attunement && <span className="ml-1 text-xs text-stone-500">(attunement)</span>}
                  </td>
                  <td className="px-2 py-2 text-stone-400">{itemSummary(i)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-stone-400">{i.cost}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-stone-400">{i.weight}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Button variant="ghost" onClick={() => navigate(`/items/${i.id}/edit`)}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => void confirmAndDeleteItem(i)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-stone-800 px-4 py-2 text-xs text-stone-500">
            {filtered ? `${shown.length} of ${all?.length}` : shown.length} item{shown.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}
    </>
  );
}
