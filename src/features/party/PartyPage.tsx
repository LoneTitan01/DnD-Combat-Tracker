import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type FormEvent } from 'react';
import { Button, Card, Field, PageHeader, TextInput } from '../../components/ui';
import { db, deletePlayer, savePlayer } from '../../db';
import {
  duplicatePlayerNames,
  formatMod,
  inCampaign,
  newId,
  partySummary,
  playerFromInput,
  type PlayerInput,
} from '../../logic';
import type { Player } from '../../models';
import { useCampaign } from '../campaigns/useCampaign';

const EMPTY: PlayerInput = { name: '', level: '', initiativeBonus: '', passivePerception: '' };

function toInput(p: Omit<Player, 'id'>): PlayerInput {
  return {
    name: p.name,
    level: p.level?.toString() ?? '',
    initiativeBonus: formatMod(p.initiativeBonus).replace('−', '-'),
    passivePerception: p.passivePerception?.toString() ?? '',
  };
}

const sameName = (a: string, dupes: Set<string>) => dupes.has(a.trim().toLowerCase());

function PlayerRow({ player, duplicate }: { player: Player; duplicate: boolean }) {
  const [text, setText] = useState<PlayerInput>(() => toInput(player));

  /** Commits on blur: invalid or blank values snap back to what's saved; numbers are clamped. */
  const commit = () => {
    const parsed = playerFromInput(text);
    if (!parsed) {
      setText(toInput(player)); // blank name: revert
      return;
    }
    setText(toInput(parsed));
    if (JSON.stringify(toInput(parsed)) !== JSON.stringify(toInput(player))) {
      void savePlayer({ ...player, ...parsed });
    }
  };

  const input = (key: keyof PlayerInput, label: string, className: string) => (
    <TextInput
      aria-label={`${label} for ${player.name}`}
      value={text[key]}
      inputMode={key === 'name' ? 'text' : 'numeric'}
      onChange={(e) => setText({ ...text, [key]: e.target.value })}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={className}
    />
  );

  return (
    <tr className="border-t border-stone-800">
      <td className="py-2 pr-2">
        {input('name', 'Name', `w-full min-w-32 ${duplicate ? 'border-amber-500' : ''}`)}
        {duplicate && <p className="mt-1 text-xs text-amber-400">Another player has this name.</p>}
      </td>
      <td className="py-2 pr-2">{input('level', 'Level', 'w-16 text-center')}</td>
      <td className="py-2 pr-2">{input('initiativeBonus', 'Initiative bonus', 'w-16 text-center')}</td>
      <td className="py-2 pr-2">{input('passivePerception', 'Passive Perception', 'w-16 text-center')}</td>
      <td className="py-2 text-right">
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`Remove ${player.name} from the party?`)) void deletePlayer(player.id);
          }}
        >
          Remove
        </Button>
      </td>
    </tr>
  );
}

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Deadly'] as const;

function PartyBudget({ players }: { players: Player[] }) {
  const s = partySummary(players);
  if (players.length === 0) return null;
  return (
    <Card className="mt-4">
      <h2 className="font-display text-lg font-semibold text-stone-200">Encounter XP thresholds</h2>
      {s.levelled === 0 ? (
        <p className="mt-1 text-sm text-stone-400">Set player levels to see this party's difficulty thresholds.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-400">
            {s.levelled} player{s.levelled === 1 ? '' : 's'}, average level {s.averageLevel!.toFixed(1)}. An
            encounter's adjusted XP at or above a threshold is that difficulty.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DIFFICULTIES.map((d, i) => (
              <div key={d} className="rounded-md bg-stone-950/60 px-3 py-2">
                <dt className="text-xs uppercase tracking-wider text-stone-500">{d}</dt>
                <dd className="text-xl font-semibold tabular-nums text-stone-100">
                  {s.thresholds[i]!.toLocaleString()} XP
                </dd>
              </div>
            ))}
          </dl>
          {s.missingLevel > 0 && (
            <p className="mt-2 text-xs text-amber-400">
              {s.missingLevel} player{s.missingLevel === 1 ? " has" : 's have'} no level and {s.missingLevel === 1 ? "isn't" : "aren't"}{' '}
              counted.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function PartyPage() {
  const { campaign } = useCampaign();
  const players = useLiveQuery(
    async () => (campaign ? (await db.players.orderBy('name').toArray()).filter(inCampaign(campaign.id)) : undefined),
    [campaign?.id],
  );
  const [form, setForm] = useState<PlayerInput>(EMPTY);
  const dupes = useMemo(() => duplicatePlayerNames(players ?? []), [players]);
  const formName = form.name.trim().toLowerCase();
  const formClashes = formName !== '' && (players ?? []).some((p) => p.name.trim().toLowerCase() === formName);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = playerFromInput(form);
    if (!parsed || !campaign) return;
    await savePlayer({ id: newId(), campaignId: campaign.id, ...parsed });
    setForm(EMPTY);
  };

  const field = (key: keyof PlayerInput, label: string, props: { placeholder?: string; className?: string } = {}) => (
    <Field label={label}>
      <TextInput
        value={form[key]}
        inputMode={key === 'name' ? 'text' : 'numeric'}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        required={key === 'name'}
        {...props}
      />
    </Field>
  );

  return (
    <>
      <PageHeader title="Party" />
      <p className="mb-4 max-w-2xl text-sm text-stone-400">
        This campaign's roster. Players track their own AC and HP; level is only used for encounter difficulty. You pick
        who is present when a combat starts.
      </p>

      <Card>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          {field('name', 'Name', { placeholder: 'Aria' })}
          {field('level', 'Level', { placeholder: '1–20', className: 'w-20' })}
          {field('initiativeBonus', 'Init bonus', { placeholder: '+0', className: 'w-20' })}
          {field('passivePerception', 'Passive Perception', { placeholder: '10', className: 'w-24' })}
          <Button type="submit" variant="primary" disabled={!campaign}>
            Add player
          </Button>
        </form>
        {formClashes && <p className="mt-2 text-xs text-amber-400">There's already a player with this name.</p>}
      </Card>

      {players && players.length > 0 && (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Level</th>
                <th className="pb-2 font-medium">Init</th>
                <th className="pb-2 font-medium">Passive Perc.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <PlayerRow key={p.id} player={p} duplicate={sameName(p.name, dupes)} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {players?.length === 0 && <p className="mt-4 text-sm text-stone-500">No players yet.</p>}

      <PartyBudget players={players ?? []} />
    </>
  );
}
