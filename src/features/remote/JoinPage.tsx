import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Chip, TextInput } from '../../components/ui';
import { conditionLabel, normalizeJoinCode, type RemotePlayer, type RemoteView, type TableGroup } from '../../logic';
import { CONDITION_DESCRIPTIONS, CONDITIONS, type ID } from '../../models';
import { InitiativeInput } from '../combat/InitiativeInput';
import { nameColor } from '../table/nameColor';
import { useRemoteClient, type ClientStatus } from './useRemoteClient';

const CODE_KEY = 'dm-combat-tracker:join-code';
const meKey = (combatId: ID) => `dm-combat-tracker:me:${combatId}`;
/** Picked "just watching" instead of a character. */
const WATCHING = '-';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: works for this visit only.
  }
}

/**
 * Player-facing page for players' own devices (`#/join`, or `#/join?code=ABC234` from the DM's link):
 * enter the DM's code, pick your character, then follow the turn order and set your own initiative
 * and conditions.
 */
export function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromUrl = normalizeJoinCode(params.get('code') ?? '');
  const code = fromUrl ?? normalizeJoinCode(load(CODE_KEY) ?? '');

  useEffect(() => {
    if (fromUrl) store(CODE_KEY, fromUrl);
  }, [fromUrl]);

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100">
      {code ? (
        <Joined
          key={code}
          code={code}
          onLeave={() => {
            store(CODE_KEY, null);
            navigate('/join', { replace: true });
          }}
        />
      ) : (
        <CodeForm onJoin={(c) => navigate(`/join?code=${c}`, { replace: true })} />
      )}
    </div>
  );
}

function CodeForm({ onJoin }: { onJoin: (code: string) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  return (
    <form
      className="mx-auto flex max-w-sm flex-col gap-4 px-4 pt-[15dvh]"
      onSubmit={(e) => {
        e.preventDefault();
        const c = normalizeJoinCode(text);
        setError(!c);
        if (c) onJoin(c);
      }}
    >
      <h1 className="font-display text-4xl font-bold">Join a combat</h1>
      <p className="text-stone-400">Enter the code from your DM's screen.</p>
      <TextInput
        aria-label="Join code"
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABC234"
        maxLength={12}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(false);
        }}
        className="py-3 text-center font-mono text-3xl uppercase tracking-[0.3em]"
      />
      {error && (
        <p className="text-sm text-red-300" role="alert">
          A code is 6 letters and numbers, like ABC234.
        </p>
      )}
      <Button variant="primary" type="submit" className="py-3 text-lg">
        Join
      </Button>
    </form>
  );
}

const STATUS: Record<ClientStatus, { text: string; tone: 'ok' | 'wait' | 'bad' }> = {
  connecting: { text: 'Connecting…', tone: 'wait' },
  connected: { text: 'Connected', tone: 'ok' },
  reconnecting: { text: 'Reconnecting…', tone: 'wait' },
  notFound: { text: "Waiting for the DM to share this code…", tone: 'wait' },
  network: { text: "Can't reach the connection server. Check your internet.", tone: 'bad' },
  unsupported: { text: "This browser can't connect peer-to-peer.", tone: 'bad' },
  closed: { text: 'The DM stopped sharing.', tone: 'bad' },
};

function Joined({ code, onLeave }: { code: string; onLeave: () => void }) {
  const { status, view, send, retry } = useRemoteClient(code);
  const s = STATUS[status];
  const [myId, setMyId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (view) setMyId(load(meKey(view.combatId)));
  }, [view?.combatId]);

  const choose = (id: string) => {
    if (!view) return;
    store(meKey(view.combatId), id);
    setMyId(id);
    setPicking(false);
  };

  const me = view?.players.find((p) => p.id === myId) ?? null;
  const needsPick = !!view && view.players.length > 0 && (picking || (!me && myId !== WATCHING));

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold">{view?.name || 'Combat'}</h1>
          <p className="flex items-center gap-1.5 text-xs text-stone-400" role="status" aria-label="Connection">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${s.tone === 'ok' ? 'bg-emerald-400' : s.tone === 'wait' ? 'animate-pulse bg-amber-400' : 'bg-red-400'}`}
            />
            {s.text}
            <span className="text-stone-600">· {code}</span>
          </p>
        </div>
        {view?.table.status === 'active' && (
          <p className="text-right text-sm text-stone-400">
            Round <span className="block text-2xl font-bold tabular-nums text-white" aria-label="Round">{view.round}</span>
          </p>
        )}
      </header>

      {(status === 'closed' || status === 'network') && (
        <div className="flex gap-2">
          <Button onClick={retry}>Try again</Button>
          <Button variant="ghost" onClick={onLeave}>
            Enter another code
          </Button>
        </div>
      )}

      {!view ? (
        status !== 'closed' && <p className="py-16 text-center text-stone-400">{s.text}</p>
      ) : needsPick ? (
        <CharacterPicker players={view.players} onPick={choose} />
      ) : (
        <CombatView view={view} me={me} send={send} />
      )}

      <footer className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
        {view && view.players.length > 0 && !needsPick && (
          <button type="button" className="text-amber-400 hover:underline" onClick={() => setPicking(true)}>
            {me ? `Not ${me.name}?` : 'Pick your character'}
          </button>
        )}
        <button type="button" className="text-stone-400 hover:underline" onClick={onLeave}>
          Leave
        </button>
      </footer>
    </div>
  );
}

function CharacterPicker({ players, onPick }: { players: RemotePlayer[]; onPick: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Choose your character">
      <h2 className="text-lg font-semibold">Who are you playing?</h2>
      {players.map((p) => (
        <Button key={p.id} className="py-3 text-lg" onClick={() => onPick(p.id)}>
          {p.name}
        </Button>
      ))}
      <Button variant="ghost" onClick={() => onPick(WATCHING)}>
        Just watching
      </Button>
    </section>
  );
}

function names(g: TableGroup) {
  return g.names.map((n, i) => (g.creatures[i] ? `${n} (${g.creatures[i]})` : n)).join(', ');
}

function CombatView({ view, me, send }: { view: RemoteView; me: RemotePlayer | null; send: ReturnType<typeof useRemoteClient>['send'] }) {
  const t = view.table;
  const myTurn = t.status === 'active' && !!me && t.current.kind === 'player' && t.current.names.includes(me.name);
  const nextUp = t.status === 'active' && !!me && !myTurn && t.upNext?.kind === 'player' && t.upNext.names.includes(me.name);

  // A buzz when your turn comes round, for phones face-down on the table.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) navigator.vibrate?.(200);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  return (
    <>
      {t.status === 'waiting' && (
        <p className="rounded-lg border border-stone-800 bg-stone-900 p-6 text-center text-lg text-stone-300">
          Waiting for the DM to start the combat.
        </p>
      )}
      {t.status === 'over' && (
        <p className="rounded-lg border border-stone-800 bg-stone-900 p-6 text-center text-lg text-stone-300">Combat over.</p>
      )}

      {t.status === 'active' && (
        <section
          aria-live="polite"
          aria-label="Now"
          className={`rounded-xl border-2 p-4 ${myTurn ? 'border-amber-400 bg-amber-500/15' : 'border-stone-800 bg-stone-900'}`}
        >
          {myTurn ? (
            <p className="font-display text-4xl font-bold text-amber-300">Your turn!</p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Now</p>
              <p className={`font-display text-3xl font-bold ${nameColor(t.current)}`}>
                {names(t.current)}
              </p>
            </>
          )}
          {t.upNext && (
            <p className="mt-2 text-stone-300" aria-label="Up next">
              <span className="mr-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Up next</span>
              {nextUp ? <strong className="text-amber-300">You{t.upNext.names.length > 1 ? ` and ${t.upNext.names.filter((n) => n !== me?.name).join(', ')}` : ''}</strong> : (
                <span className={nameColor(t.upNext)}>{names(t.upNext)}</span>
              )}
              {t.upNext.newRound && <span className="ml-2 text-xs text-stone-500">(round {view.round + 1})</span>}
            </p>
          )}
        </section>
      )}

      {me && t.status !== 'over' && <MyCharacter me={me} send={send} />}

      {view.order.length > 0 && (
        <section aria-label="Turn order">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-stone-400">Turn order</h2>
          <ol className="flex flex-col gap-1">
            {view.order.map((turn) => {
              const player = turn.kind === 'player' ? view.players.find((p) => p.id === turn.id) : undefined;
              return (
                <li
                  key={turn.id}
                  aria-current={turn.current ? 'step' : undefined}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${turn.current ? 'border-amber-500 bg-amber-500/10' : 'border-stone-800 bg-stone-900/60'}`}
                >
                  <span className="w-8 text-center tabular-nums text-stone-400">{player?.initiative ?? ''}</span>
                  <span className={`flex-1 font-semibold ${nameColor(turn, 'text-stone-100')}`}>
                    {turn.current && <span className="mr-1 text-amber-400">▶</span>}
                    {turn.name}
                    {turn.creature && <span className="ml-2 text-xs font-normal text-stone-400">{turn.creature}</span>}
                    {turn.id === me?.id && <span className="ml-2 text-xs font-normal text-sky-300">you</span>}
                  </span>
                  {player && player.conditions.length > 0 && (
                    <span className="flex flex-wrap justify-end gap-1">
                      {player.conditions.map((c) => (
                        <span key={c.name} className="rounded bg-violet-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-200">
                          {conditionLabel(c)}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}

function MyCharacter({ me, send }: { me: RemotePlayer; send: ReturnType<typeof useRemoteClient>['send'] }) {
  const active = new Map(me.conditions.map((c) => [c.name, c]));
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-sky-900 bg-sky-950/20 p-4" aria-label="Your character">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 font-display text-xl font-bold">{me.name}</h2>
        <label className="flex items-center gap-2 text-sm text-stone-300">
          Initiative
          <InitiativeInput
            label="Your initiative"
            value={me.initiative}
            onCommit={(n) => send({ type: 'setInitiative', combatantId: me.id, initiative: n })}
            className="py-2 text-lg"
          />
        </label>
      </div>
      <div>
        <h3 className="mb-1.5 text-xs uppercase tracking-wider text-stone-400">Conditions</h3>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((name) => {
            const cond = active.get(name);
            return (
              <Chip
                key={name}
                on={!!cond}
                title={CONDITION_DESCRIPTIONS[name]}
                onClick={() => send({ type: 'setCondition', combatantId: me.id, condition: name, on: !cond })}
              >
                {cond ? conditionLabel(cond) : name}
              </Chip>
            );
          })}
        </div>
      </div>
    </section>
  );
}
