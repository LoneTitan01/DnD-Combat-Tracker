import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, PageHeader, Select, TextInput } from '../../components/ui';
import { useUrlFilters } from '../../components/useUrlFilters';
import { db } from '../../db';
import { allTags, encounterStats, encounterSummary, filterEncounters, groupByTag, inCampaign } from '../../logic';
import type { CreatureTemplate, Encounter, ID } from '../../models';
import { useCampaign } from '../campaigns/useCampaign';
import { stageEncounter } from '../combat/stage';
import { confirmAndDeleteEncounter, duplicateAndSaveEncounter } from './actions';
import { DifficultyBadge } from './Difficulty';

function EncounterCard({
  encounter,
  templates,
  partyLevels,
}: {
  encounter: Encounter;
  templates: ReadonlyMap<ID, CreatureTemplate>;
  partyLevels: number[];
}) {
  const navigate = useNavigate();
  const stats = encounterStats(encounter, templates, partyLevels);
  const summary = encounterSummary(encounter, templates);
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Link
          to={`/encounters/${encounter.id}`}
          className="flex-1 font-display text-lg font-semibold text-stone-100 hover:text-amber-300"
        >
          {encounter.name || 'Untitled'}
        </Link>
        <DifficultyBadge difficulty={stats.difficulty} />
      </div>
      <p className="text-sm text-stone-300">{summary || <span className="text-stone-500">No creatures yet</span>}</p>
      {stats.missing.length > 0 && (
        <p className="text-xs text-amber-400">Uses {stats.missing.length} deleted stat block{stats.missing.length === 1 ? '' : 's'}.</p>
      )}
      {encounter.description && <p className="line-clamp-2 text-xs text-stone-500">{encounter.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
        <span className="mr-auto text-xs tabular-nums text-stone-500">
          {stats.baseXP.toLocaleString()} XP · adjusted {stats.adjustedXP.toLocaleString()}
        </span>
        <Button
          variant="ghost"
          disabled={stats.monsterCount === 0}
          onClick={async () => navigate(`/combats/${await stageEncounter(encounter.id)}`)}
        >
          Stage
        </Button>
        <Button variant="ghost" onClick={async () => navigate(`/encounters/${await duplicateAndSaveEncounter(encounter.id)}`)}>
          Duplicate
        </Button>
        <Button variant="ghost" onClick={() => void confirmAndDeleteEncounter(encounter)}>
          Delete
        </Button>
      </div>
    </Card>
  );
}

export function EncountersPage() {
  const navigate = useNavigate();
  const { campaign } = useCampaign();
  const cid = campaign?.id;
  const encounters = useLiveQuery(
    async () => (cid ? (await db.encounters.toArray()).filter(inCampaign(cid)) : undefined),
    [cid],
  );
  const creatures = useLiveQuery(() => db.creatures.toArray());
  const players = useLiveQuery(async () => (cid ? (await db.players.toArray()).filter(inCampaign(cid)) : undefined), [cid]);
  const templates = useMemo(() => new Map((creatures ?? []).map((c) => [c.id, c])), [creatures]);
  const partyLevels = (players ?? []).map((p) => p.level).filter((l): l is number => l !== undefined);

  const { params, setFilter: setParam } = useUrlFilters();
  const query = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';

  const tags = useMemo(() => allTags(encounters ?? []), [encounters]);
  const groups = useMemo(() => groupByTag(filterEncounters(encounters ?? [], { query, tag })), [encounters, query, tag]);
  // With a tag filter, show just that group (an encounter's other tags don't need their own headings).
  const shownGroups = tag ? groups.filter((g) => g.tag.toLowerCase() === tag.toLowerCase()) : groups;

  return (
    <>
      <PageHeader title="Encounters">
        <Button variant="primary" onClick={() => navigate('/encounters/new')}>
          New encounter
        </Button>
      </PageHeader>

      {encounters && encounters.length > 0 && (
        <Card className="mb-4 flex flex-wrap gap-3">
          <TextInput
            type="search"
            aria-label="Search encounters"
            placeholder="Search by name or description…"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            className="min-w-48 flex-1"
          />
          <Select aria-label="Tag" value={tag} onChange={(e) => setParam('tag', e.target.value)}>
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Card>
      )}

      {encounters?.length === 0 && (
        <Card className="text-center text-sm text-stone-400">
          <p>No encounters in this campaign yet.</p>
          <p className="mt-1">Build one from your bestiary; players are added when the fight starts.</p>
        </Card>
      )}
      {encounters && encounters.length > 0 && shownGroups.length === 0 && (
        <p className="text-sm text-stone-500">No encounters match.</p>
      )}

      {partyLevels.length === 0 && encounters && encounters.length > 0 && (
        <p className="mb-3 text-xs text-stone-500">
          Difficulty labels appear once players in the{' '}
          <Link to="/party" className="text-amber-400 hover:underline">
            party
          </Link>{' '}
          have levels.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {shownGroups.map((g) => (
          <section key={g.tag || '(untagged)'} aria-label={g.tag || 'Untagged'}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              {g.tag || 'Untagged'} <span className="text-stone-600">· {g.encounters.length}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.encounters.map((e) => (
                <EncounterCard key={e.id} encounter={e} templates={templates} partyLevels={partyLevels} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
