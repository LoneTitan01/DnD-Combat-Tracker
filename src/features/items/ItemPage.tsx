import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui';
import { db } from '../../db';
import { confirmAndDeleteItem, downloadItems } from './actions';
import { ItemCard } from './ItemCard';

export function ItemPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  // `null` = loaded but missing; `undefined` = still loading.
  const item = useLiveQuery(async () => (await db.items.get(id)) ?? null, [id]);

  if (item === undefined) return null;
  if (item === null) {
    return (
      <p className="text-stone-400">
        That item doesn't exist.{' '}
        <Link to="/items" className="text-amber-400 hover:underline">
          Back to the items
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to={`/items?category=${item.category}`} className="mr-auto text-sm text-stone-400 hover:text-stone-100">
          ← Items
        </Link>
        <Button variant="primary" onClick={() => navigate(`/items/${item.id}/edit`)}>
          Edit
        </Button>
        <Button onClick={() => void downloadItems([item.id], item.name)}>Export</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (await confirmAndDeleteItem(item)) navigate('/items', { replace: true });
          }}
        >
          Delete
        </Button>
      </div>
      <article className="rounded-lg border border-amber-900/60 bg-stone-900 p-5 shadow-lg">
        <ItemCard item={item} />
      </article>
    </div>
  );
}
