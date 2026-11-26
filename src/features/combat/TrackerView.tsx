import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useShortcuts } from '../../components/shortcuts';
import { ariaKey, keyLabel, useHotkeys } from '../settings/hotkeys';
import { Button, Card, Select } from '../../components/ui';
import { db } from '../../db';
import {
  addCreature,
  addPlayer,
  changeInitiative,
  duplicateTokenNames,
  endCombat,
  livingCreatureCount,
  moveCombatant,
  nextTurn,
  describeLogEntry,
  removeCombatant,
  campaignOf,
  inCampaign,
} from '../../logic';
import type { Combat, Combatant, CreatureTemplate, ID, LogEntry } from '../../models';
import { CombatNotes } from './CombatNotes';
import { ConditionBadges, ConditionEditor } from './Conditions';
import { MultiTargetPanel, type Targets } from './MultiTarget';
import { CreaturePicker } from '../bestiary/CreaturePicker';
import { CombatLog, XPTally } from './CombatLog';
import { CreaturePanel, HPBar } from './DamagePanel';
import { InitiativeInput } from './InitiativeInput';
import { RechargeChips, TurnBanners } from './Recharge';
import type { UpdateCombat } from './useCombat';

/** What kind of creature a token is (e.g. "Goblin"), from its snapshot or its stat block. */
function kindOf(c: Combatant, template: CreatureTemplate | undefined): string {
  return (c.creatureName ?? template?.name ?? '').trim();
}

function Row({
  c,
  index,
  count,
  isCurrent,
  isSelected,
  duplicate,
  template,
  update,
  onSelect,
  onDrop,
  multi,
  targeted,
  combat,
}: {
  c: Combatant;
  index: number;
  count: number;
  isCurrent: boolean;
  isSelected: boolean;
  duplicate: boolean;
  template: CreatureTemplate | undefined;
  update: UpdateCombat;
  onSelect: () => void;
  onDrop: (from: number) => void;
  /** Multi-target mode: living creatures show a checkbox and a click toggles them. */
  multi: boolean;
  targeted: boolean;
  combat: Combat;
}) {
  const targetable = multi && c.kind === 'creature' && !c.isDead;
  const [over, setOver] = useState(false);
  return (
    <li
      aria-current={isCurrent ? 'step' : undefined}
      aria-label={c.tokenName}
      draggable
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isInteger(from)) onDrop(from);
      }}
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
        isCurrent ? 'border-amber-500 bg-amber-500/10' : 'border-stone-800 bg-stone-900/60 hover:border-stone-600'
      } ${isSelected && !multi ? 'ring-2 ring-amber-400/60' : ''} ${targeted ? 'ring-2 ring-sky-500' : ''} ${over ? 'border-t-4 border-t-sky-500' : ''} ${
        c.isDead ? 'opacity-50' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {targetable ? (
          <input
            type="checkbox"
            className="h-4 w-4 accent-sky-500"
            aria-label={`Target ${c.tokenName}`}
            checked={targeted}
            onClick={(e) => e.stopPropagation()}
            onChange={onSelect}
          />
        ) : (
          <span className="w-4 cursor-grab select-none text-stone-600" aria-hidden title="Drag to reorder">
            ⋮⋮
          </span>
        )}
        <span onClick={(e) => e.stopPropagation()}>
          <InitiativeInput
            label={`Initiative for ${c.tokenName}`}
            value={c.initiative}
            onCommit={(n) => update((cb) => changeInitiative(cb, c.id, n))}
          />
        </span>
        <div className="min-w-32 flex-1">
          <span className={`font-semibold ${c.isDead ? 'text-stone-500 line-through' : c.kind === 'creature' && c.ally ? 'text-emerald-300' : 'text-stone-100'}`}>
            {isCurrent && <span className="mr-1 text-amber-400">▶</span>}
            {c.tokenName}
          </span>
          {c.kind === 'creature' && kindOf(c, template) && (
            <span
              className="ml-2 text-xs text-stone-400"
              title={template ? `${template.size} ${template.type}` : undefined}
              aria-label={`Creature: ${kindOf(c, template)}`}
            >
              {kindOf(c, template)}
            </span>
          )}
          {c.kind === 'player' && <span className="ml-2 text-xs text-sky-300">player</span>}
          {c.kind === 'creature' && c.ally && <span className="ml-2 text-xs text-emerald-300">ally</span>}
          {c.isDead && <span className="ml-2 text-xs text-red-400">dead</span>}
          {duplicate && <span className="ml-2 text-xs text-amber-400">duplicate name</span>}
          {c.showFakeName && (
            <span className="ml-2 text-xs text-violet-300" title="Players see a fake creature">
              🎭 {c.fakeName?.trim() ? `shown as ${c.fakeName.trim()}` : 'creature hidden'}
            </span>
          )}
          {c.notes && (
            <span className="ml-2 text-xs text-stone-400" title={c.notes} aria-label={`Notes: ${c.notes}`}>
              📝
            </span>
          )}
          <ConditionBadges combat={combat} combatant={c} />
        </div>
        {c.kind === 'creature' && <HPBar c={c} />}
        <span className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" className="px-1.5" aria-label={`Move ${c.tokenName} up`} disabled={index === 0} onClick={() => update((cb) => moveCombatant(cb, index, index - 1))}>
            ↑
          </Button>
          <Button variant="ghost" className="px-1.5" aria-label={`Move ${c.tokenName} down`} disabled={index === count - 1} onClick={() => update((cb) => moveCombatant(cb, index, index + 1))}>
            ↓
          </Button>
        </span>
      </div>
      {c.kind === 'creature' && (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-[5.5rem]">
          <RechargeChips combatant={c} template={template} update={update} />
        </div>
      )}
      {isCurrent && c.kind === 'creature' && <TurnBanners combatant={c} template={template} update={update} />}
    </li>
  );
}

function AddPlayerControl({ combat, update }: { combat: Combat; update: UpdateCombat }) {
  // Only this combat's campaign's party.
  const cid = campaignOf(combat);
  const players = useLiveQuery(async () => (await db.players.orderBy('name').toArray()).filter(inCampaign(cid)), [cid]);
  const inCombat = new Set(combat.combatants.map((c) => c.playerId).filter(Boolean));
  const available = (players ?? []).filter((p) => !inCombat.has(p.id));
  const [pid, setPid] = useState('');
  const [init, setInit] = useState('');
  const n = /^[+-]?\d+$/.test(init.trim()) ? Number(init) : null;
  const player = available.find((p) => p.id === pid);
  if (available.length === 0) return <p className="text-xs text-stone-500">Everyone in the roster is in this combat.</p>;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select aria-label="Player to add" value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">Choose a player…</option>
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <input
        aria-label="Initiative for joining player"
        inputMode="numeric"
        placeholder="Init"
        value={init}
        onChange={(e) => setInit(e.target.value)}
        className="w-16 rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-center text-sm"
      />
      <Button
        disabled={!player || n === null}
        onClick={() => {
          if (!player || n === null) return;
          update((c) => addPlayer(c, player, n));
          setPid('');
          setInit('');
        }}
      >
        Add player
      </Button>
    </div>
  );
}

export function TrackerView({
  combat,
  update,
  templates,
}: {
  combat: Combat;
  update: UpdateCombat;
  templates: ReadonlyMap<ID, CreatureTemplate>;
}) {
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  // Bumped on every row click so the damage box refocuses even when re-selecting the same creature.
  const [focusSignal, setFocusSignal] = useState(0);
  // False when the panel opened by itself for the current turn, so the damage box doesn't steal the N key.
  const [focusOnOpen, setFocusOnOpen] = useState(true);
  const [adding, setAdding] = useState<'creature' | 'player' | null>(null);
  const [multi, setMulti] = useState(false);
  const [targets, setTargets] = useState<Targets>({});
  const dupes = useMemo(() => duplicateTokenNames(combat), [combat]);
  const creatures = useMemo(() => [...templates.values()], [templates]);
  const selected = combat.combatants.find((c) => c.id === selectedId);
  const tpl = (c: Combatant | undefined) => (c?.templateId ? templates.get(c.templateId) : undefined);
  const allDown = livingCreatureCount(combat) === 0;

  // Conditions that ran out during the last turn change, shown until the next one.
  const turnKey = `${combat.round}:${combat.turnIndex}`;
  const logMark = useRef(combat.log.length);
  const [expired, setExpired] = useState<LogEntry[]>([]);
  useEffect(() => {
    setExpired(combat.log.slice(logMark.current).filter((e) => e.type === 'conditionEnded'));
    logMark.current = combat.log.length;
  }, [turnKey]);
  // Follow the turn: show the acting creature's stat block, close it on a player's turn.
  const current = combat.combatants[combat.turnIndex];
  useEffect(() => {
    setFocusOnOpen(false);
    setSelectedId(current?.kind === 'creature' ? current.id : null);
  }, [combat.round, current?.id]);
  const nameOf = (id: ID) => combat.combatants.find((x) => x.id === id)?.tokenName ?? 'Removed combatant';

  const toggleMulti = () => {
    setMulti((m) => !m);
    setTargets({});
    setAdding(null);
  };
  const toggleTarget = (c: Combatant) => {
    if (c.kind !== 'creature' || c.isDead) return;
    const next = { ...targets };
    if (c.id in next) delete next[c.id];
    else next[c.id] = null;
    setTargets(next);
  };

  const hotkeys = useHotkeys();
  useShortcuts({
    [hotkeys.nextTurn]: () => update(nextTurn),
    [hotkeys.multiTarget]: toggleMulti,
    [hotkeys.close]: () => {
      if (multi) toggleMulti();
      else if (adding) setAdding(null);
      else setSelectedId(null);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-[5] -mx-4 flex flex-wrap items-center gap-3 border-b border-stone-800 bg-stone-950/95 py-2 pl-[calc(1rem+var(--nav-button-space,0px))] pr-4 backdrop-blur">
        <p className="text-lg font-semibold">
          Round <span className="tabular-nums text-amber-300" aria-label="Round">{combat.round}</span>
        </p>
        <Button
          variant="primary"
          className="px-6 py-2 text-base"
          aria-keyshortcuts={ariaKey(hotkeys.nextTurn)}
          title={`Next turn (${keyLabel(hotkeys.nextTurn)})`}
          onClick={() => update(nextTurn)}
        >
          Next turn →
        </Button>
        <p className="hidden text-xs text-stone-500 xl:block">
          <kbd className="rounded border border-stone-700 px-1">{keyLabel(hotkeys.nextTurn)}</kbd> next turn ·{' '}
          <kbd className="rounded border border-stone-700 px-1">{keyLabel(hotkeys.multiTarget)}</kbd> multi-target ·{' '}
          <kbd className="rounded border border-stone-700 px-1">{keyLabel(hotkeys.close)}</kbd> close
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            aria-pressed={multi}
            aria-keyshortcuts={ariaKey(hotkeys.multiTarget)}
            title={`Damage several creatures at once (${keyLabel(hotkeys.multiTarget)})`}
            className={multi ? 'border-sky-400! bg-sky-600! text-white! hover:bg-sky-500!' : ''}
            onClick={toggleMulti}
          >
            Multi-target
          </Button>
          <Button onClick={() => setAdding(adding === 'creature' ? null : 'creature')}>+ Creature</Button>
          <Button onClick={() => setAdding(adding === 'player' ? null : 'player')}>+ Player</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('End this combat?')) update(endCombat);
            }}
          >
            End combat
          </Button>
        </div>
      </div>

      {allDown && (
        <Card className="flex flex-wrap items-center gap-3 border-emerald-800 bg-emerald-950/30">
          <p className="text-sm text-emerald-200">Every creature is down.</p>
          <Button variant="primary" onClick={() => update(endCombat)}>
            End combat
          </Button>
        </Card>
      )}

      {expired.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-violet-800 bg-violet-950/30">
          <ul className="flex-1 text-sm text-violet-200" role="status" aria-label="Conditions ended">
            {expired.map((e) => (
              <li key={e.id}>{describeLogEntry(e, nameOf, () => '')}</li>
            ))}
          </ul>
          <Button variant="ghost" onClick={() => setExpired([])}>
            Dismiss
          </Button>
        </Card>
      )}

      {adding === 'player' && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-stone-300">A player joins</h2>
          <AddPlayerControl combat={combat} update={update} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-2" aria-label="Turn order">
            {combat.combatants.map((c, i) => (
              <Row
                key={c.id}
                c={c}
                index={i}
                count={combat.combatants.length}
                isCurrent={i === combat.turnIndex}
                isSelected={c.id === selectedId}
                duplicate={dupes.has(c.tokenName.trim().toLowerCase())}
                template={tpl(c)}
                update={update}
                multi={multi}
                targeted={c.id in targets}
                combat={combat}
                onSelect={() => {
                  if (multi) {
                    toggleTarget(c);
                    return;
                  }
                  // Always select (hitting the same creature twice is common); the panel's ✕ closes it.
                  // Choosing a combatant also takes the side panel back from the reinforcements picker.
                  if (adding === 'creature') setAdding(null);
                  setSelectedId(c.id);
                  setFocusOnOpen(true);
                  setFocusSignal((n) => n + 1);
                }}
                onDrop={(from) => update((cb) => moveCombatant(cb, from, i))}
              />
            ))}
          </ol>
          <XPTally combat={combat} />
          <CombatLog combat={combat} templates={templates} update={update} />
        </div>

        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          {multi ? (
            <MultiTargetPanel
              combat={combat}
              templates={templates}
              targets={targets}
              setTargets={setTargets}
              update={update}
              onDone={toggleMulti}
            />
          ) : adding === 'creature' ? (
            <CreaturePicker
              title="Reinforcements"
              creatures={creatures}
              onAdd={(tid) => {
                const t = templates.get(tid);
                if (t) update((c) => addCreature(c, t));
              }}
            />
          ) : selected?.kind === 'creature' ? (
            <CreaturePanel
              combatant={selected}
              template={tpl(selected)}
              update={update}
              combat={combat}
              focusSignal={focusSignal}
              autoFocus={focusOnOpen}
              onClose={() => setSelectedId(null)}
            />
          ) : selected?.kind === 'player' ? (
            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold">{selected.tokenName}</h2>
              <p className="text-sm text-stone-400">Players track their own HP and AC.</p>
              <ConditionEditor combat={combat} combatant={selected} update={update} />
              <CombatNotes key={selected.id} combatant={selected} update={update} />
              <div>
                <Button
                  onClick={() => {
                    if (confirm(`${selected.tokenName} leaves the combat?`)) {
                      update((c) => removeCombatant(c, selected.id));
                      setSelectedId(null);
                    }
                  }}
                >
                  Leaves the combat
                </Button>
              </div>
            </Card>
          ) : (
            <p className="hidden text-sm text-stone-500 lg:block">
              Click a creature for its stat block, damage and conditions. Press M to damage several at once.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
