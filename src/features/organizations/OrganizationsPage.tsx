import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, Field, PageHeader, Select, TextArea, TextInput } from '../../components/ui';
import { useUrlFilters } from '../../components/useUrlFilters';
import { deleteOrganization, saveOrganization, setOrganizationMembers } from '../../db';
import { blankOrganization, filterOrganizations, findOrganizationByName, membersOf } from '../../logic';
import type { Npc, Organization } from '../../models';
import { NpcLink, useNpcs } from '../locations/shared';
import { useCampaign } from '../campaigns/useCampaign';
import { useOrganizations } from './shared';

function OrganizationCard({ organization, npcs, duplicate }: { organization: Organization; npcs: Npc[]; duplicate: boolean }) {
  const [name, setName] = useState(organization.name);
  const [description, setDescription] = useState(organization.description);
  const members = membersOf(npcs, organization.id);
  const others = npcs.filter((n) => !n.organizationIds?.includes(organization.id));
  const memberIds = members.map((n) => n.id);

  /** Commits on blur: a blank name snaps back to what's saved. */
  const commitName = () => {
    const n = name.trim();
    setName(n || organization.name);
    if (n && n !== organization.name) void saveOrganization({ ...organization, name: n });
  };
  const commitDescription = () => {
    if (description !== organization.description) void saveOrganization({ ...organization, description });
  };
  const setMembers = (ids: string[]) => void setOrganizationMembers(organization.id, organization.campaignId, ids);

  return (
    <Card className="mt-4">
      <section aria-label={organization.name}>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-48 flex-1">
            <TextInput
              aria-label={`Name for ${organization.name}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className={`w-full font-semibold ${duplicate ? 'border-amber-500' : ''}`}
            />
            {duplicate && <p className="mt-1 text-xs text-amber-400">Another organization has this name.</p>}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm(`Delete ${organization.name}? Its members are kept.`)) void deleteOrganization(organization.id);
            }}
          >
            Delete
          </Button>
        </div>
        <TextArea
          aria-label={`Description for ${organization.name}`}
          rows={3}
          value={description}
          placeholder="What they are, what they want, who leads them…"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          className="mt-3 w-full"
        />
        <div className="mt-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-500">Members</h3>
          {members.length > 0 ? (
            <ul aria-label={`Members of ${organization.name}`} className="flex flex-wrap gap-2">
              {members.map((n) => (
                <li key={n.id} className="flex items-center gap-1 rounded-full border border-stone-700 py-0.5 pl-3 pr-1 text-sm">
                  <NpcLink name={n.name} />
                  <button
                    type="button"
                    aria-label={`Remove ${n.name} from ${organization.name}`}
                    onClick={() => setMembers(memberIds.filter((id) => id !== n.id))}
                    className="rounded-full px-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">No members yet.</p>
          )}
          {others.length > 0 && (
            <Select
              aria-label={`Add a member to ${organization.name}`}
              value=""
              onChange={(e) => e.target.value && setMembers([...memberIds, e.target.value])}
              className="mt-2 w-full sm:w-64"
            >
              <option value="">Add a member…</option>
              {others.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </section>
    </Card>
  );
}

export function OrganizationsPage() {
  const organizations = useOrganizations();
  const npcs = useNpcs();
  const { params, setFilter, clearFilters } = useUrlFilters();
  const query = params.get('q') ?? '';
  const [name, setName] = useState('');
  const shown = useMemo(() => filterOrganizations(organizations ?? [], query, npcs ?? []), [organizations, query, npcs]);
  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const o of organizations ?? []) seen.set(o.name.toLowerCase(), (seen.get(o.name.toLowerCase()) ?? 0) + 1);
    return seen;
  }, [organizations]);
  const clash = findOrganizationByName(organizations ?? [], name);

  return (
    <>
      <PageHeader title="Organizations" />
      <p className="mb-4 max-w-2xl text-sm text-stone-400">
        Guilds, cults, noble houses and other groups your{' '}
        <Link to="/npcs" className="text-amber-400 hover:underline">
          NPCs
        </Link>{' '}
        belong to. When an NPC's notes mention an organization by name, hovering the name shows what it is.
      </p>

      <AddOrganization name={name} setName={setName} clash={!!clash} />

      {organizations && organizations.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TextInput
            type="search"
            aria-label="Search organizations"
            placeholder="Search by name, description or member"
            value={query}
            onChange={(e) => setFilter('q', e.target.value)}
            className="w-full sm:w-72"
          />
          {query && (
            <Button variant="ghost" onClick={() => clearFilters()}>
              Clear
            </Button>
          )}
        </div>
      )}
      {npcs &&
        shown.map((o) => <OrganizationCard key={o.id} organization={o} npcs={npcs} duplicate={(dupes.get(o.name.toLowerCase()) ?? 0) > 1} />)}
      {organizations && organizations.length > 0 && shown.length === 0 && (
        <p className="mt-4 text-sm text-stone-500">No organizations match "{query.trim()}".</p>
      )}
      {organizations?.length === 0 && <p className="mt-4 text-sm text-stone-500">No organizations yet.</p>}
    </>
  );
}

function AddOrganization({ name, setName, clash }: { name: string; setName: (n: string) => void; clash: boolean }) {
  const { campaign } = useCampaign();
  const campaignId = campaign?.id;
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || !campaignId) return;
    await saveOrganization(blankOrganization(campaignId, n));
    setName('');
  };
  return (
    <Card>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="The Harpers" required />
        </Field>
        <Button type="submit" variant="primary" disabled={!campaignId}>
          Add organization
        </Button>
      </form>
      {clash && <p className="mt-2 text-xs text-amber-400">There's already an organization with this name.</p>}
    </Card>
  );
}
