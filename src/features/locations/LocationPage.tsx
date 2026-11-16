import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card } from '../../components/ui';
import { deleteLocation } from '../../db';
import { ancestorsOf, childrenOf, siblingsOf } from '../../logic';
import type { Location } from '../../models';
import { LocationLink, NpcLink, useLocations } from './shared';

function Section({ title, empty, children }: { title: string; empty?: string; children?: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">{title}</h2>
      {children ?? <p className="text-sm text-stone-500">{empty}</p>}
    </section>
  );
}

function LinkList({ items }: { items: ReactNode[] }) {
  return <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{items}</ul>;
}

async function confirmAndDelete(loc: Location, all: Location[]): Promise<boolean> {
  const inside = childrenOf(all, loc.id).length;
  const parent = all.find((l) => l.id === loc.parentId);
  const note = inside
    ? `\n\n${inside} place${inside === 1 ? ' is' : 's are'} inside it; ${inside === 1 ? 'it' : 'they'} will move ${
        parent ? `into ${parent.name}` : 'to the top level'
      }.`
    : '';
  if (!confirm(`Delete ${loc.name}?${note}`)) return false;
  await deleteLocation(loc.id);
  return true;
}

export function LocationPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { locations } = useLocations();

  if (!locations) return null;
  const loc = locations.find((l) => l.id === id);
  if (!loc) {
    return (
      <p className="text-stone-400">
        That location doesn't exist in this campaign.{' '}
        <Link to="/locations" className="text-amber-400 hover:underline">
          Back to the locations
        </Link>
      </p>
    );
  }

  const ancestors = ancestorsOf(locations, loc);
  const parent = locations.find((l) => l.id === loc.parentId);
  const siblings = siblingsOf(locations, loc);
  const children = childrenOf(locations, loc.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Breadcrumb" className="mr-auto text-sm text-stone-400">
          <Link to="/locations" className="hover:text-stone-100">
            Locations
          </Link>
          {ancestors.map((a) => (
            <span key={a.id}>
              {' › '}
              <Link to={`/locations/${a.id}`} className="hover:text-stone-100">
                {a.name}
              </Link>
            </span>
          ))}
        </nav>
        <Button onClick={() => navigate(`/locations/new?parent=${loc.id}`)}>Add a place inside</Button>
        <Button variant="primary" onClick={() => navigate(`/locations/${loc.id}/edit`)}>
          Edit
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (await confirmAndDelete(loc, locations)) navigate(parent ? `/locations/${parent.id}` : '/locations', { replace: true });
          }}
        >
          Delete
        </Button>
      </div>

      <h1 className="mb-4 font-display text-3xl font-bold text-stone-100">{loc.name}</h1>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <Card>
          <Section title="Notes" empty="No notes yet.">
            {loc.notes ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-200">{loc.notes}</p> : undefined}
          </Section>
        </Card>

        <Card className="flex flex-col gap-4">
          <Section title="Inside of" empty="Nowhere: a top-level place.">
            {parent ? (
              <p className="text-sm">
                <LocationLink location={parent} />
              </p>
            ) : undefined}
          </Section>
          <Section title="Places inside" empty="None.">
            {children.length ? (
              <LinkList
                items={children.map((c) => (
                  <li key={c.id}>
                    <LocationLink location={c} />
                  </li>
                ))}
              />
            ) : undefined}
          </Section>
          <Section title="Sibling locations" empty="None.">
            {siblings.length ? (
              <LinkList
                items={siblings.map(({ location: s }) => (
                  <li key={s.id}>
                    <LocationLink location={s} />
                  </li>
                ))}
              />
            ) : undefined}
          </Section>
          <Section title="NPCs" empty="None noted.">
            {loc.npcs.length ? (
              <LinkList
                items={loc.npcs.map((n) => (
                  <li key={n}>
                    <NpcLink name={n} />
                  </li>
                ))}
              />
            ) : undefined}
          </Section>
        </Card>
      </div>
    </div>
  );
}
