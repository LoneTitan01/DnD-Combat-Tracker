import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Card, PageHeader } from '../../components/ui';
import { db } from '../../db';
import { inCampaign } from '../../logic';
import { useCampaign } from '../campaigns/useCampaign';

function Stat({ label, value, to }: { label: string; value: number | undefined; to: string }) {
  return (
    <Link to={to} className="block">
      <Card className="transition-colors hover:border-amber-500/50">
        <div className="text-3xl font-bold tabular-nums text-stone-100">{value ?? '–'}</div>
        <div className="text-sm text-stone-400">{label}</div>
      </Card>
    </Link>
  );
}

export function HomePage() {
  const { campaign } = useCampaign();
  const cid = campaign?.id;
  const counts = useLiveQuery(async () => {
    if (!cid) return undefined;
    const here = inCampaign(cid);
    return {
      creatures: await db.creatures.count(),
      encounters: await db.encounters.filter(here).count(),
      staged: await db.combats.where('status').equals('staged').filter(here).count(),
      active: await db.combats.where('status').equals('active').filter(here).count(),
      players: await db.players.filter(here).count(),
    };
  }, [cid]);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  return (
    <>
      <PageHeader title="Prep & Play">
        <Link
          to="/join"
          className="rounded-md border border-sky-800 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-950"
          title="For players: follow the DM's combat on this device"
        >
          Player? Join a combat →
        </Link>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Stat blocks" value={counts?.creatures} to="/bestiary" />
        <Stat label="Encounters" value={counts?.encounters} to="/encounters" />
        <Stat label="Ready to run" value={counts?.staged} to="/combats" />
        <Stat label="In progress" value={counts?.active} to="/combats" />
        <Stat label="Players" value={counts?.players} to="/party" />
      </div>

      <Card className="mt-6">
        <h2 className="font-display text-lg font-semibold text-stone-200">How it fits together</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stone-400">
          <li>
            Pick (or create) a{' '}
            <Link className="text-amber-400 hover:underline" to="/campaigns">
              campaign
            </Link>
            . Its party, encounters and combats are kept together; the bestiary is shared.
          </li>
          <li>
            Write stat blocks in the{' '}
            <Link className="text-amber-400 hover:underline" to="/bestiary">
              Bestiary
            </Link>
            .
          </li>
          <li>
            Build{' '}
            <Link className="text-amber-400 hover:underline" to="/encounters">
              Encounters
            </Link>{' '}
            from them — no players needed.
          </li>
          <li>Stage an encounter ahead of time: token names, HP, optional initiative.</li>
          <li>
            On game night, start it with the{' '}
            <Link className="text-amber-400 hover:underline" to="/party">
              players
            </Link>{' '}
            who showed up.
          </li>
        </ol>
      </Card>

      <p className="mt-6 text-xs text-stone-500">
        Everything is stored in this browser (IndexedDB) and works offline.{' '}
        {persisted === true && 'Storage is marked persistent.'}
        {persisted === false && 'The browser may clear storage under pressure, so export your bestiary as a backup.'}
      </p>
    </>
  );
}
