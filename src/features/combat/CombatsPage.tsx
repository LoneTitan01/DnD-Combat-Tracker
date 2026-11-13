import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { Button, Card, PageHeader } from '../../components/ui';
import { db } from '../../db';
import { defeatedXP } from '../../logic';
import type { Combat } from '../../models';
import { confirmAndDeleteCombat } from './stage';

function ago(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ts).toLocaleDateString();
}

function CombatCard({ combat }: { combat: Combat }) {
  const creatures = combat.combatants.filter((c) => c.kind === 'creature');
  const alive = creatures.filter((c) => !c.isDead).length;
  const players = combat.combatants.filter((c) => c.kind === 'player').length;
  const current = combat.combatants[combat.turnIndex];
  return (
    <Card className="flex flex-col gap-1.5">
      <Link to={`/combats/${combat.id}`} className="font-display text-lg font-semibold text-stone-100 hover:text-amber-300">
        {combat.name || 'Untitled'}
      </Link>
      <p className="text-sm text-stone-400">
        {combat.status === 'staged' &&
          `${creatures.length} creature${creatures.length === 1 ? '' : 's'}, ${
            creatures.filter((c) => c.initiative !== null).length
          } with initiative`}
        {combat.status === 'active' &&
          `Round ${combat.round}${current ? `, ${current.tokenName}'s turn` : ''} · ${alive}/${creatures.length} creatures standing · ${players} player${players === 1 ? '' : 's'}`}
        {combat.status === 'ended' && `${combat.round} rounds · ${defeatedXP(combat).toLocaleString()} XP`}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="mr-auto text-xs text-stone-500">{ago(combat.updatedAt)}</span>
        <Button variant="ghost" onClick={() => void confirmAndDeleteCombat(combat)}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

const SECTIONS: Array<{ status: Combat['status']; title: string; empty: string }> = [
  { status: 'active', title: 'In progress', empty: '' },
  { status: 'staged', title: 'Ready to run', empty: 'Stage an encounter to prepare it ahead of time.' },
  { status: 'ended', title: 'Ended', empty: '' },
];

export function CombatsPage() {
  const combats = useLiveQuery(() => db.combats.orderBy('updatedAt').reverse().toArray());
  if (!combats) return null;
  return (
    <>
      <PageHeader title="Combats" />
      {combats.length === 0 && (
        <Card className="text-center text-sm text-stone-400">
          <p>No combats yet.</p>
          <p className="mt-1">
            Open an{' '}
            <Link to="/encounters" className="text-amber-400 hover:underline">
              encounter
            </Link>{' '}
            and press Stage to get it ready to run.
          </p>
        </Card>
      )}
      <div className="flex flex-col gap-6">
        {combats.length > 0 &&
          SECTIONS.map(({ status, title, empty }) => {
            const list = combats.filter((c) => c.status === status);
            if (list.length === 0 && !empty) return null;
            return (
              <section key={status} aria-label={title}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
                  {title} <span className="text-stone-600">· {list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-stone-500">{empty}</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((c) => (
                      <CombatCard key={c.id} combat={c} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
      </div>
    </>
  );
}
