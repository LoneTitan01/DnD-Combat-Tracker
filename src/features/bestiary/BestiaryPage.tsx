import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { nextSort, SortableHeader } from '../../components/SortableHeader';
import { Button, Card, PageHeader, Select, TextInput } from '../../components/ui';
import { useUrlFilters } from '../../components/useUrlFilters';
import { db } from '../../db';
import { CR_VALUES, CREATURE_SORTS, creatureTypes, filterCreatures, formatHitDice, type CreatureFilter, type CreatureSort } from '../../logic';

const asSort = (v: string | null): CreatureSort => (CREATURE_SORTS.includes(v as CreatureSort) ? (v as CreatureSort) : 'name');
import { confirmAndDelete, duplicateAndSave } from './actions';
import { describeImport, downloadBestiary, importBestiaryFile } from './backup';

export function BestiaryPage() {
  const navigate = useNavigate();
  const all = useLiveQuery(() => db.creatures.toArray());
  // Filters live in the URL so they survive going to a stat block and back.
  const { params, setFilter, clearFilters } = useUrlFilters();
  const sort = asSort(params.get('sort'));
  const desc = params.get('dir') === 'desc';
  const filter: CreatureFilter = {
    query: params.get('q') ?? '',
    type: params.get('type') ?? '',
    crMin: params.get('crMin') ?? '',
    crMax: params.get('crMax') ?? '',
  };

  const { query, type, crMin, crMax } = filter;
  const shown = useMemo(
    () => filterCreatures(all ?? [], { query, type, crMin, crMax, sort, desc }),
    [all, query, type, crMin, crMax, sort, desc],
  );
  const onSort = (column: CreatureSort) => {
    const next = nextSort({ sort, desc }, column);
    setFilter('sort', next.sort === 'name' ? '' : next.sort);
    setFilter('dir', next.desc ? 'desc' : '');
  };
  const sortProps = { sort, desc, onSort };
  const types = useMemo(() => creatureTypes(all ?? []), [all]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const filtered = !!(filter.query || filter.type || filter.crMin || filter.crMax);

  const onImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setMessage({ text: describeImport(await importBestiaryFile(file)) });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Import failed.', error: true });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <PageHeader title="Bestiary">
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
          onClick={() => void downloadBestiary(filtered ? shown.map((c) => c.id) : undefined)}
          title={filtered ? 'Exports the stat blocks matching the current filters' : 'Exports every stat block'}
        >
          {filtered ? `Export ${shown.length} shown` : 'Export all'}
        </Button>
        <Button onClick={() => navigate('/bestiary/bulk')} title="Paste several at once from a PDF, a website or your notes">
          Bulk add
        </Button>
        <Button variant="primary" onClick={() => navigate('/bestiary/new')}>
          New stat block
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

      <Card className="mb-4 flex flex-wrap items-end gap-3">
        <TextInput
          type="search"
          aria-label="Search by name"
          placeholder="Search by name…"
          value={filter.query}
          onChange={(e) => setFilter('q', e.target.value)}
          className="min-w-48 flex-1"
        />
        <Select aria-label="Type" value={filter.type} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1.5 text-sm text-stone-400">
          CR
          <Select aria-label="Minimum CR" value={filter.crMin} onChange={(e) => setFilter('crMin', e.target.value)}>
            <option value="">any</option>
            {CR_VALUES.map((cr) => (
              <option key={cr}>{cr}</option>
            ))}
          </Select>
          to
          <Select aria-label="Maximum CR" value={filter.crMax} onChange={(e) => setFilter('crMax', e.target.value)}>
            <option value="">any</option>
            {CR_VALUES.map((cr) => (
              <option key={cr}>{cr}</option>
            ))}
          </Select>
        </div>
        {filtered && (
          <Button variant="ghost" onClick={() => clearFilters(['sort', 'dir'])}>
            Clear
          </Button>
        )}
      </Card>

      {all && all.length === 0 && (
        <Card className="text-center text-sm text-stone-400">
          <p>No stat blocks yet.</p>
          <p className="mt-1">Create one, or import a JSON backup.</p>
        </Card>
      )}

      {all && all.length > 0 && shown.length === 0 && (
        <p className="text-sm text-stone-500">No stat blocks match these filters.</p>
      )}

      {shown.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-800">
                <SortableHeader column="name" label="Name" className="px-4" {...sortProps} />
                <SortableHeader column="type" label="Type" className="px-2" {...sortProps} />
                <SortableHeader column="cr" label="CR" align="right" className="px-2" {...sortProps} />
                <th className="px-2 py-2 text-right font-medium">XP</th>
                <th className="px-2 py-2 text-right font-medium">AC</th>
                <th className="px-2 py-2 text-right font-medium">HP</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-t border-stone-800/70 hover:bg-stone-800/40">
                  <td className="px-4 py-2">
                    <Link to={`/bestiary/${c.id}`} className="font-semibold text-stone-100 hover:text-amber-300">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-stone-400">
                    {c.size} {c.type}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.cr}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-stone-400">{c.xp.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.ac}</td>
                  <td className="px-2 py-2 text-right tabular-nums" title={formatHitDice(c.hitDice)}>
                    {c.maxHP}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Button variant="ghost" onClick={() => navigate(`/bestiary/${c.id}/edit`)}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={async () => navigate(`/bestiary/${await duplicateAndSave(c)}/edit`)}>
                      Duplicate
                    </Button>
                    <Button variant="ghost" onClick={() => void confirmAndDelete(c)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-stone-800 px-4 py-2 text-xs text-stone-500">
            {filtered ? `${shown.length} of ${all?.length}` : shown.length} stat block{shown.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}
    </>
  );
}
