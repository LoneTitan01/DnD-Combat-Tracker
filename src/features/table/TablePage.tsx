import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { db } from '../../db';
import { nextTurn, tableView, type TableGroup, type TableView } from '../../logic';
import type { Combat } from '../../models';
import { openChannel, type TableMessage } from './tableChannel';

/**
 * Player-facing page (feature 7): who's up now, who's up next, and the round. Large type, high
 * contrast, no controls. `#/table?combat=<id>` follows one combat; `#/table?demo` shows sample data
 * (→ or space advances the turn).
 */
export function TablePage() {
  const [params] = useSearchParams();
  const combatId = params.get('combat');
  const demo = params.has('demo');
  const [view, setView] = useState<TableView>({ status: 'waiting' });

  // Live mode: load the last saved state, then follow the DM window over BroadcastChannel.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    let receivedLive = false;

    const initial = combatId
      ? db.combats.get(combatId)
      : db.combats.where('status').equals('active').reverse().sortBy('updatedAt').then((l) => l[0]);
    initial.then(
      (c) => {
        if (!cancelled && !receivedLive) setView(tableView(c));
      },
      () => {},
    );

    const ch = openChannel();
    if (ch) {
      ch.onmessage = (e: MessageEvent<TableMessage>) => {
        const msg = e.data;
        if (msg?.type !== 'view' || (combatId && msg.combatId !== combatId)) return;
        receivedLive = true;
        setView(msg.view);
      };
      ch.postMessage({ type: 'hello' } satisfies TableMessage);
    }
    return () => {
      cancelled = true;
      ch?.close();
    };
  }, [combatId, demo]);

  return demo ? <DemoTable /> : <TableScreen view={view} />;
}

function DemoTable() {
  const [combat, setCombat] = useState<Combat>(() => ({
    id: 'demo',
    encounterId: 'demo',
    name: 'Demo',
    round: 1,
    turnIndex: 0,
    log: [],
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
    combatants: ['Aria', 'Brom', 'Goblin 2', 'Cass', 'Red Cap'].map((name, i) => ({
      id: `demo-${i}`,
      kind: i === 2 || i === 4 ? 'creature' : 'player',
      tokenName: name,
      initiative: 20 - i,
      initiativeBonus: 0,
      currentHP: 1,
      tempHP: 0,
      maxHP: 1,
      isDead: false,
      conditions: [],
      xp: 0,
      abilityStates: [],
    })),
  }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setCombat((c) => nextTurn(c));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <TableScreen view={tableView(combat)} />;
}

function Names({ group, className }: { group: TableGroup; className: string }) {
  return (
    <ul className={className}>
      {group.names.map((name, i) => (
        <li key={`${name}-${i}`} className="leading-tight break-words">
          {name}
        </li>
      ))}
    </ul>
  );
}

export function TableScreen({ view }: { view: TableView }) {
  if (view.status !== 'active') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black p-8 text-center text-white">
        <p className="font-display text-[clamp(3rem,9vw,7rem)] font-bold">
          {view.status === 'waiting' ? 'Waiting to start' : 'Combat over'}
        </p>
      </div>
    );
  }

  const { round, current, upNext } = view;
  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <header className="px-8 pt-6 text-right text-[clamp(1.5rem,3vw,2.5rem)] font-semibold tracking-wide text-stone-300">
        Round <span className="tabular-nums text-white">{round}</span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-8 pb-8 text-center" aria-live="polite">
        <p className="mb-4 text-[clamp(1rem,2vw,1.75rem)] font-semibold uppercase tracking-[0.3em] text-amber-400">
          {current.kind === 'player' && current.names.length > 1 ? 'Your turns' : 'Now'}
        </p>
        <Names
          group={current}
          className={`font-display font-bold ${
            current.names.length > 2 ? 'text-[clamp(2.5rem,7vw,6rem)]' : 'text-[clamp(3.5rem,11vw,9rem)]'
          } ${current.kind === 'creature' ? 'text-red-300' : 'text-white'}`}
        />
      </main>

      {upNext && (
        <footer
          className="border-t-4 border-amber-400 bg-stone-900 px-8 py-5"
          aria-live="polite"
          aria-label="Up next"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-baseline gap-x-8 gap-y-2">
            <span className="text-[clamp(1rem,2vw,1.75rem)] font-bold uppercase tracking-[0.3em] text-amber-400">
              Up next
            </span>
            <span
              className={`font-display text-[clamp(2rem,5vw,4rem)] font-bold leading-tight ${
                upNext.kind === 'creature' ? 'text-red-300' : 'text-white'
              }`}
            >
              {upNext.names.join(', ')}
            </span>
            {upNext.newRound && (
              <span className="rounded-full border-2 border-stone-500 px-4 py-1 text-[clamp(0.9rem,1.6vw,1.4rem)] font-semibold text-stone-300">
                Round {round + 1}
              </span>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
