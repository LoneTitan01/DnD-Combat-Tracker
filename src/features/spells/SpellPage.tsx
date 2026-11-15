import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card } from '../../components/ui';
import { creaturesUsingSpell, db } from '../../db';
import { confirmAndDeleteSpell, downloadSpells } from './actions';
import { SpellCard } from './SpellCard';

export function SpellPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  // `null` = loaded but missing; `undefined` = still loading.
  const spell = useLiveQuery(async () => (await db.spells.get(id)) ?? null, [id]);
  const usedBy = useLiveQuery(() => creaturesUsingSpell(id), [id]);

  if (spell === undefined) return null;
  if (spell === null) {
    return (
      <p className="text-stone-400">
        That spell doesn't exist.{' '}
        <Link to="/spells" className="text-amber-400 hover:underline">
          Back to the spells
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link to="/spells" className="mr-auto text-sm text-stone-400 hover:text-stone-100">
          ← Spells
        </Link>
        <Button variant="primary" onClick={() => navigate(`/spells/${spell.id}/edit`)}>
          Edit
        </Button>
        <Button onClick={() => void downloadSpells([spell.id], spell.name)}>Export</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (await confirmAndDeleteSpell(spell)) navigate('/spells', { replace: true });
          }}
        >
          Delete
        </Button>
      </div>
      <article className="rounded-lg border border-sky-900/60 bg-stone-900 p-5 shadow-lg">
        <SpellCard spell={spell} />
      </article>
      {usedBy && usedBy.length > 0 && (
        <Card className="mt-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Linked stat blocks</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {usedBy
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <li key={c.id}>
                  <Link to={`/bestiary/${c.id}`} className="text-amber-400 hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
