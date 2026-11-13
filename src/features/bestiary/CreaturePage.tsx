import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui';
import { db } from '../../db';
import { confirmAndDelete, duplicateAndSave } from './actions';
import { downloadBestiary } from './backup';
import { StatBlock } from './StatBlock';

export function CreaturePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  // `null` = loaded but missing; `undefined` = still loading.
  const creature = useLiveQuery(async () => (await db.creatures.get(id)) ?? null, [id]);

  if (creature === undefined) return null;
  if (creature === null) {
    return (
      <p className="text-stone-400">
        That stat block doesn't exist.{' '}
        <Link to="/bestiary" className="text-amber-400 hover:underline">
          Back to the bestiary
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/bestiary" className="mr-auto text-sm text-stone-400 hover:text-stone-100">
          ← Bestiary
        </Link>
        <Button variant="primary" onClick={() => navigate(`/bestiary/${creature.id}/edit`)}>
          Edit
        </Button>
        <Button onClick={async () => navigate(`/bestiary/${await duplicateAndSave(creature)}/edit`)}>Duplicate</Button>
        <Button onClick={() => void downloadBestiary([creature.id], creature.name)}>Export</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (await confirmAndDelete(creature)) navigate('/bestiary', { replace: true });
          }}
        >
          Delete
        </Button>
      </div>
      <StatBlock creature={creature} />
    </div>
  );
}
