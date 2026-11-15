import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Card, PageHeader, Select, TextInput } from '../../components/ui';
import { db, restoreSrdSpells } from '../../db';
import { filterSpells, spellLevelLabel, spellSchools } from '../../logic';
import { confirmAndDeleteSpell, describeSpellImport, downloadSpells, importSpellFile } from './actions';
import { SpellMention } from './SpellMention';

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Tag({ children, title }: { children: string; title: string }) {
  return (
    <span title={title} className="ml-1.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
      {children}
    </span>
  );
}

export function SpellsPage() {
  const navigate = useNavigate();
  const all = useLiveQuery(() => db.spells.toArray());
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const level = params.get('level') ?? '';
  const school = params.get('school') ?? '';
  const setFilter = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const shown = useMemo(() => filterSpells(all ?? [], { query, level, school }), [all, query, level, school]);
  const schools = useMemo(() => spellSchools(all ?? []), [all]);
  const filtered = !!(query || level || school);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const onImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setMessage({ text: describeSpellImport(await importSpellFile(file)) });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Import failed.', error: true });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onRestore = async () => {
    try {
      const n = await restoreSrdSpells();
      setMessage({ text: n ? `Restored ${n} SRD spell${n === 1 ? '' : 's'}.` : 'All SRD spells are already in the list.' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Restore failed.', error: true });
    }
  };

  return (
    <>
      <PageHeader title="Spells">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void onImport(e.target.files)}
        />
        <Button
          onClick={() => void onRestore()}
          title="Adds back any of the SRD 5.2 (2024 rules) spells that aren't in the list, including deleted ones"
        >
          Restore SRD spells
        </Button>
        <Button onClick={() => fileInput.current?.click()}>Import JSON</Button>
        <Button
          disabled={!all?.length}
          onClick={() => void downloadSpells(filtered ? shown.map((s) => s.id) : undefined)}
          title={filtered ? 'Exports the spells matching the current filters' : 'Exports every spell'}
        >
          {filtered ? `Export ${shown.length} shown` : 'Export all'}
        </Button>
        <Button variant="primary" onClick={() => navigate('/spells/new')}>
          New spell
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
          value={query}
          onChange={(e) => setFilter('q', e.target.value)}
          className="min-w-48 flex-1"
        />
        <Select aria-label="Level" value={level} onChange={(e) => setFilter('level', e.target.value)}>
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {spellLevelLabel(l)}
            </option>
          ))}
        </Select>
        <Select aria-label="School" value={school} onChange={(e) => setFilter('school', e.target.value)}>
          <option value="">All schools</option>
          {schools.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </Select>
        {filtered && (
          <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
            Clear
          </Button>
        )}
      </Card>

      {all && all.length === 0 && (
        <Card className="text-center text-sm text-stone-400">
          <p>No spells yet.</p>
          <p className="mt-1">
            Create one, import a JSON file, or restore the SRD spells. Link spells to a stat block in its editor, and their names in the stat block
            show the spell on hover.
          </p>
        </Card>
      )}

      {all && all.length > 0 && shown.length === 0 && <p className="text-sm text-stone-500">No spells match these filters.</p>}

      {shown.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-800">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Level</th>
                <th className="px-2 py-2 font-medium">School</th>
                <th className="px-2 py-2 font-medium">Casting time</th>
                <th className="px-2 py-2 font-medium">Range</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="border-t border-stone-800/70 hover:bg-stone-800/40">
                  <td className="px-4 py-2">
                    <Link to={`/spells/${s.id}`} className="font-semibold text-stone-100 hover:text-amber-300">
                      {s.name}
                    </Link>
                    {s.concentration && <Tag title="Concentration">C</Tag>}
                    {s.ritual && <Tag title="Ritual">R</Tag>}
                  </td>
                  <td className="px-2 py-2 text-stone-400">{spellLevelLabel(s.level)}</td>
                  <td className="px-2 py-2 capitalize text-stone-400">{s.school}</td>
                  <td className="px-2 py-2 text-stone-400">{s.castingTime}</td>
                  <td className="px-2 py-2 text-stone-400">{s.range}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <span className="mr-2 text-xs">
                      <SpellMention spell={s}>Preview</SpellMention>
                    </span>
                    <Button variant="ghost" onClick={() => navigate(`/spells/${s.id}/edit`)}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => void confirmAndDeleteSpell(s)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-stone-800 px-4 py-2 text-xs text-stone-500">
            {filtered ? `${shown.length} of ${all?.length}` : shown.length} spell{shown.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}

      <p className="mt-6 text-xs leading-relaxed text-stone-500">
        Includes the spells of the{' '}
        <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noreferrer" className="underline hover:text-stone-300">
          System Reference Document 5.2
        </a>{' '}
        (“SRD 5.2”) by Wizards of the Coast LLC, licensed under the{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/legalcode"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-stone-300"
        >
          Creative Commons Attribution 4.0 International License
        </a>
        .
      </p>
    </>
  );
}
