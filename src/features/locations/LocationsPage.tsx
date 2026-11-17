import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, PageHeader, TextInput } from '../../components/ui';
import { useUrlFilters } from '../../components/useUrlFilters';
import { ancestorsOf, filterLocations, locationTree } from '../../logic';
import { locationPath, useLocations } from './shared';

export function LocationsPage() {
  const navigate = useNavigate();
  const { locations, campaignId } = useLocations();
  const { params, setFilter, clearFilters } = useUrlFilters();
  const query = params.get('q') ?? '';
  const all = locations ?? [];
  const tree = useMemo(() => locationTree(all), [all]);
  const matches = useMemo(() => (query ? filterLocations(all, query) : []), [all, query]);

  return (
    <>
      <PageHeader title="Locations">
        <Button variant="primary" disabled={!campaignId} onClick={() => navigate('/locations/new')}>
          New location
        </Button>
      </PageHeader>
      <p className="mb-4 max-w-2xl text-sm text-stone-400">
        This campaign's places. Put places inside others (a shop inside its town) to build an outline, and keep notes
        and the NPCs found at each one.
      </p>

      {all.length > 0 && (
        <Card className="mb-4 flex flex-wrap items-end gap-3">
          <TextInput
            type="search"
            aria-label="Search locations"
            placeholder="Search names, notes and NPCs…"
            value={query}
            onChange={(e) => setFilter('q', e.target.value)}
            className="min-w-48 flex-1"
          />
          {query && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </Card>
      )}

      {locations?.length === 0 && (
        <Card className="text-center text-sm text-stone-400">
          <p>No locations yet.</p>
          <p className="mt-1">Start with the town or region the adventure takes place in, then add the places inside it.</p>
        </Card>
      )}

      {query && all.length > 0 && matches.length === 0 && <p className="text-sm text-stone-500">No locations match.</p>}

      {query && matches.length > 0 && (
        <Card className="p-0">
          <ul aria-label="Locations">
            {matches.map((l) => {
              const path = ancestorsOf(all, l).map((a) => a.name);
              return (
                <li key={l.id} className="border-t border-stone-800/70 px-4 py-2 first:border-t-0">
                  <Link to={locationPath(l.id)} className="font-semibold text-stone-100 hover:text-amber-300">
                    {l.name}
                  </Link>
                  {path.length > 0 && <span className="ml-2 text-xs text-stone-500">in {path.join(' › ')}</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {!query && tree.length > 0 && (
        <Card className="p-0">
          <ul aria-label="Locations">
            {tree.map(({ location: l, depth }) => (
              <li
                key={l.id}
                className="flex items-baseline gap-2 border-t border-stone-800/70 py-2 pr-4 first:border-t-0"
                style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
              >
                {depth > 0 && (
                  <span aria-hidden className="text-stone-600">
                    └
                  </span>
                )}
                <Link to={locationPath(l.id)} className="font-semibold text-stone-100 hover:text-amber-300">
                  {l.name}
                </Link>
                {l.npcs.length > 0 && (
                  <span className="ml-auto truncate text-xs text-stone-500">
                    {l.npcs.length} NPC{l.npcs.length === 1 ? '' : 's'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-stone-800 px-4 py-2 text-xs text-stone-500">
            {all.length} location{all.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}
    </>
  );
}
