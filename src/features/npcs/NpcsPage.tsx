import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, Field, PageHeader, Select, TextArea, TextInput } from '../../components/ui';
import { useUrlFilters } from '../../components/useUrlFilters';
import { deleteNpc, saveNpc } from '../../db';
import { filterNpcs, findNpcByName, newId, placeOptions } from '../../logic';
import type { Npc } from '../../models';
import { locationPath, useLocations, useNpcs } from '../locations/shared';

type Place = { id: string; label: string };

/** Where an NPC lives: any location in the campaign, or none. */
function PlaceSelect({ value, places, onChange, label }: { value: string; places: Place[]; onChange: (id: string) => void; label?: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-w-40">
      <option value="">No location</option>
      {places.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </Select>
  );
}

function NpcRow({ npc, places, duplicate, startOpen }: { npc: Npc; places: Place[]; duplicate: boolean; startOpen: boolean }) {
  const [name, setName] = useState(npc.name);
  const [notes, setNotes] = useState(npc.notes ?? '');
  const [open, setOpen] = useState(startOpen);
  const home = places.find((p) => p.id === npc.locationId);
  const saved = (npc.notes ?? '').trim();

  /** Commits on blur: a blank name snaps back to what's saved. */
  const commitName = () => {
    const n = name.trim();
    setName(n || npc.name);
    if (n && n !== npc.name) void saveNpc({ ...npc, name: n });
  };

  /** Commits on blur, so typing doesn't save on every keystroke. */
  const commitNotes = () => {
    if (notes !== (npc.notes ?? '')) void saveNpc({ ...npc, notes });
  };

  return (
    <>
      <tr className="border-t border-stone-800">
        <td className="py-2 pr-2 align-top">
          <TextInput
            aria-label={`Name for ${npc.name}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className={`w-full min-w-32 ${duplicate ? 'border-amber-500' : ''}`}
          />
          {duplicate && <p className="mt-1 text-xs text-amber-400">Another NPC has this name.</p>}
          {!open && saved && <p className="mt-1 max-w-xs truncate text-xs text-stone-500">{saved.split('\n')[0]}</p>}
        </td>
        <td className="py-2 pr-2 align-top">
          <PlaceSelect
            label={`Location for ${npc.name}`}
            value={npc.locationId ?? ''}
            places={places}
            onChange={(id) => void saveNpc({ ...npc, locationId: id || undefined })}
          />
        </td>
        <td className="whitespace-nowrap py-2 text-right align-top">
          <Button variant="ghost" aria-expanded={open} aria-label={`Notes for ${npc.name}`} onClick={() => setOpen(!open)}>
            {open ? 'Hide notes' : saved ? 'Notes' : 'Add notes'}
          </Button>
          {home && (
            <Link
              to={locationPath(home.id)}
              aria-label={`Go to ${home.label}`}
              className="mr-1 inline-block rounded-md px-3 py-1.5 text-sm text-amber-400 hover:bg-stone-800"
            >
              View place
            </Link>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete ${npc.name}?`)) void deleteNpc(npc.id);
            }}
          >
            Delete
          </Button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3} className="pb-3">
            <TextArea
              aria-label={`Notes text for ${npc.name}`}
              rows={4}
              value={notes}
              placeholder="Who they are, what they want, what they know, how they talk…"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
              className="w-full"
            />
          </td>
        </tr>
      )}
    </>
  );
}

export function NpcsPage() {
  const { locations, campaignId } = useLocations();
  const npcs = useNpcs();
  const { params, setFilter, clearFilters } = useUrlFilters();
  const query = params.get('q') ?? '';
  const [name, setName] = useState('');
  // Kept after adding: NPCs are often entered a place at a time.
  const [locationId, setLocationId] = useState('');
  const places = useMemo(() => placeOptions(locations ?? []), [locations]);
  const shown = useMemo(() => filterNpcs(npcs ?? [], query, locations ?? []), [npcs, query, locations]);
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const n of npcs ?? []) seen.set(n.name.toLowerCase(), (seen.get(n.name.toLowerCase()) ?? 0) + 1);
    return seen;
  }, [npcs]);
  const clash = findNpcByName(npcs ?? [], name);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || !campaignId) return;
    await saveNpc({ id: newId(), campaignId, name: n, locationId: locationId || undefined });
    setName('');
  };

  return (
    <>
      <PageHeader title="NPCs" />
      <p className="mb-4 max-w-2xl text-sm text-stone-400">
        The people your players meet in this campaign, and where they live. Places come from the{' '}
        <Link to="/locations" className="text-amber-400 hover:underline">
          locations
        </Link>{' '}
        list.
      </p>

      <Card>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Old Tom" required />
          </Field>
          <Field label="Lives in">
            <PlaceSelect value={locationId} places={places} onChange={setLocationId} />
          </Field>
          <Button type="submit" variant="primary" disabled={!campaignId}>
            Add NPC
          </Button>
        </form>
        {clash && <p className="mt-2 text-xs text-amber-400">There's already an NPC with this name.</p>}
        {locations?.length === 0 && (
          <p className="mt-2 text-xs text-stone-500">
            Add places on the{' '}
            <Link to="/locations" className="text-amber-400 hover:underline">
              Locations
            </Link>{' '}
            page to say where NPCs live.
          </p>
        )}
      </Card>

      {npcs && npcs.length > 0 && (
        <Card className="mt-4 overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TextInput
              type="search"
              aria-label="Search NPCs"
              placeholder="Search by name, location or notes"
              value={query}
              onChange={(e) => setFilter('q', e.target.value)}
              className="w-full sm:w-72"
            />
            {query && (
              <Button variant="ghost" onClick={() => clearFilters()}>
                Clear
              </Button>
            )}
          </div>
          {shown.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Lives in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((n) => (
                  <NpcRow
                    key={n.id}
                    npc={n}
                    places={places}
                    duplicate={(dupes.get(n.name.toLowerCase()) ?? 0) > 1}
                    // Following an NPC's link from a location lands on just them, so show their notes.
                    startOpen={!!query.trim() && shown.length === 1}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-stone-500">No NPCs match "{query.trim()}".</p>
          )}
        </Card>
      )}
      {npcs?.length === 0 && <p className="mt-4 text-sm text-stone-500">No NPCs yet.</p>}
    </>
  );
}
