import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, PageHeader, TextArea, TextInput } from '../../components/ui';
import { campaignContents, db, deleteCampaign, saveCampaign } from '../../db';
import { campaignOf, newCampaign } from '../../logic';
import type { Campaign } from '../../models';
import { useCampaign } from './useCampaign';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function CampaignCard({ campaign, current, only, onSelect }: { campaign: Campaign; current: boolean; only: boolean; onSelect: () => void }) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description);
  const counts = useLiveQuery(async () => {
    const id = campaign.id;
    const [players, locations, encounters, combats] = await Promise.all([
      db.players.filter((r) => campaignOf(r) === id).count(),
      db.locations.filter((r) => campaignOf(r) === id).count(),
      db.encounters.filter((r) => campaignOf(r) === id).count(),
      db.combats.filter((r) => campaignOf(r) === id).count(),
    ]);
    return { players, locations, encounters, combats };
  }, [campaign.id]);

  const commit = () => {
    const next = { ...campaign, name: name.trim() || campaign.name, description: description.trim() };
    setName(next.name);
    setDescription(next.description);
    if (next.name !== campaign.name || next.description !== campaign.description) void saveCampaign(next);
  };

  const remove = async () => {
    const c = await campaignContents(campaign.id);
    const what = [plural(c.players.length, 'player'), plural(c.locations.length, 'location'), plural(c.encounters.length, 'encounter'), plural(c.combats.length, 'combat')];
    if (!confirm(`Delete the campaign "${campaign.name}" with its ${what.join(', ')}? Stat blocks in the bestiary are kept.`)) return;
    await deleteCampaign(campaign.id);
  };

  return (
    <Card className={`flex flex-col gap-3 ${current ? 'border-amber-600/60' : ''}`}>
      <div className="flex items-center gap-2">
        <TextInput
          aria-label={`Name of ${campaign.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="flex-1 font-display text-lg font-semibold"
        />
        {current && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Current</span>}
      </div>
      <TextArea
        aria-label={`Description of ${campaign.name}`}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commit}
        placeholder="Setting, party, where you left off…"
        rows={2}
      />
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-auto text-xs text-stone-500">
          {counts ? `${plural(counts.players, 'player')} · ${plural(counts.locations, 'location')} · ${plural(counts.encounters, 'encounter')} · ${plural(counts.combats, 'combat')}` : ' '}
        </span>
        {!current && (
          <Button variant="primary" onClick={onSelect}>
            Switch to
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={only}
          title={only ? "You need at least one campaign. Create another before deleting this one." : undefined}
          onClick={() => void remove()}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

export function CampaignsPage() {
  const { campaigns, campaign, select } = useCampaign();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const c = newCampaign(name, description);
    await saveCampaign(c);
    select(c.id);
    setName('');
    setDescription('');
  };

  return (
    <>
      <PageHeader title="Campaigns" />
      <p className="mb-4 max-w-2xl text-sm text-stone-400">
        Each campaign has its own party, locations, encounters and combats. The bestiary is shared by all of them. The campaign
        you pick here is the one every page shows.
      </p>

      <Card>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <Field label="Campaign name" className="min-w-48 flex-1">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Curse of the Crimson Keep" required />
          </Field>
          <Field label="Description" className="min-w-48 flex-[2]">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Field>
          <Button type="submit" variant="primary">
            Create campaign
          </Button>
        </form>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(campaigns ?? []).map((c) => (
          <CampaignCard
            key={c.id}
            campaign={c}
            current={c.id === campaign?.id}
            only={campaigns!.length === 1}
            onSelect={() => select(c.id)}
          />
        ))}
      </div>
    </>
  );
}
