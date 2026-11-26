import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card } from '../../components/ui';
import { db, deleteLocation, restockLocation } from '../../db';
import { ancestorsOf, childrenOf, itemSubtitle, itemSummary, needsRestock, npcsAt, siblingsOf, stockLabel } from '../../logic';
import type { Item, Location, ShopItem } from '../../models';
import { LocationLink, NpcLink, useLocations, useNpcs } from './shared';

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

/** A shop row's item: a link to it in the item list, with its type, or plain text for rows not tied to one. */
function ShopItemName({ row, item }: { row: ShopItem; item: Item | undefined }) {
  if (!item) return <span className="font-medium">{row.name}</span>;
  const details = [itemSubtitle(item), itemSummary(item)].filter(Boolean).join(', ');
  return (
    <>
      <Link to={`/items/${item.id}`} className="font-medium text-amber-400 hover:underline">
        {item.name}
      </Link>
      <span className="block text-xs text-stone-500">{details}</span>
    </>
  );
}

function ShopTable({ locationId, items }: { locationId: string; items: ShopItem[] }) {
  const ids = items.map((i) => i.itemId).filter((i): i is string => !!i);
  const listed = useLiveQuery(
    async () => new Map((await db.items.bulkGet(ids)).filter((i): i is Item => !!i).map((i) => [i.id, i])),
    [ids.join()],
  );
  const counted = items.some((i) => stockLabel(i));
  const restockable = items.some((i) => i.maxStock !== undefined);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-stone-500">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Item</th>
              <th scope="col" className="py-1 pr-3 font-medium">Cost</th>
              {counted && <th scope="col" className="py-1 pr-3 font-medium">Stock</th>}
              <th scope="col" className="py-1 font-medium">Description</th>
            </tr>
          </thead>
          <tbody className="align-top text-stone-200">
            {items.map((i) => (
              <tr key={i.id} className={`border-t border-stone-800 ${i.stock === 0 ? 'opacity-60' : ''}`}>
                <td className="py-1.5 pr-3">
                  <ShopItemName row={i} item={i.itemId ? listed?.get(i.itemId) : undefined} />
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-amber-200">{i.cost}</td>
                {counted && (
                  <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
                    {stockLabel(i)}
                    {i.stock === 0 && <span className="ml-1.5 text-xs text-red-400">sold out</span>}
                  </td>
                )}
                <td className="py-1.5 text-stone-300">{i.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {restockable && (
        <div>
          <Button
            disabled={!needsRestock(items)}
            title={needsRestock(items) ? 'Fill every item back up to its maximum stock' : 'Everything is fully stocked'}
            onClick={() => void restockLocation(locationId)}
          >
            Restock
          </Button>
        </div>
      )}
    </div>
  );
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
  const npcs = useNpcs();

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
  const residents = npcsAt(npcs ?? [], loc.id);

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
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <Section title="Notes" empty="No notes yet.">
              {loc.notes ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-200">{loc.notes}</p> : undefined}
            </Section>
          </Card>
          {loc.shop?.length ? (
            <Card>
              <Section title="Shop">
                <ShopTable locationId={loc.id} items={loc.shop} />
              </Section>
            </Card>
          ) : null}
        </div>

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
            {residents.length ? (
              <LinkList
                items={residents.map((n) => (
                  <li key={n.id}>
                    <NpcLink name={n.name} />
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
