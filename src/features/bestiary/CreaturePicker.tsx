import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, TextInput } from '../../components/ui';
import { filterCreatures } from '../../logic';
import type { CreatureTemplate, ID } from '../../models';

/** Searchable bestiary list with an Add button per stat block. */
export function CreaturePicker({
  creatures,
  onAdd,
  title = 'Add from bestiary',
}: {
  creatures: CreatureTemplate[];
  onAdd: (id: ID) => void;
  title?: string;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterCreatures(creatures, { query }), [creatures, query]);
  return (
    <Card className="flex flex-col gap-2">
      {title && <h2 className="font-display text-lg font-semibold text-amber-300">{title}</h2>}
      <TextInput
        type="search"
        aria-label="Search the bestiary"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {creatures.length === 0 ? (
        <p className="text-sm text-stone-400">
          The bestiary is empty.{' '}
          <Link to="/bestiary/new" className="text-amber-400 hover:underline">
            Create a stat block
          </Link>{' '}
          first.
        </p>
      ) : (
        <ul className="max-h-[50dvh] overflow-y-auto pr-1" aria-label="Bestiary">
          {shown.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border-t border-stone-800/70 py-1.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-stone-100">{c.name}</div>
                <div className="text-xs text-stone-500">
                  CR {c.cr} · {c.xp.toLocaleString()} XP
                </div>
              </div>
              <Button aria-label={`Add ${c.name}`} onClick={() => onAdd(c.id)}>
                + Add
              </Button>
            </li>
          ))}
          {shown.length === 0 && <li className="py-2 text-sm text-stone-500">No matches.</li>}
        </ul>
      )}
    </Card>
  );
}
