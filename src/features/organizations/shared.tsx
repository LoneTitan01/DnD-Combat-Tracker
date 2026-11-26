import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { HoverCard } from '../../components/HoverCard';
import { db } from '../../db';
import { inCampaign, splitMentions } from '../../logic';
import type { Organization } from '../../models';
import { useCampaign } from '../campaigns/useCampaign';

/** The current campaign's organizations, by name. Undefined while loading. */
export function useOrganizations(): Organization[] | undefined {
  const { campaign } = useCampaign();
  return useLiveQuery(
    async () => (campaign ? (await db.organizations.orderBy('name').toArray()).filter(inCampaign(campaign.id)) : undefined),
    [campaign?.id],
  );
}

/** Where an organization's name leads: the organization list, searched for that name. */
export const organizationPath = (name: string) => `/organizations?${new URLSearchParams({ q: name })}`;

export function OrganizationLink({ organization }: { organization: Organization }) {
  return (
    <Link to={organizationPath(organization.name)} className="text-violet-300 hover:underline">
      {organization.name}
    </Link>
  );
}

/** An organization's name that shows its name and description on hover, focus or tap. */
export function OrganizationMention({ organization, children }: { organization: Organization; children?: ReactNode }) {
  const description = organization.description.trim();
  return (
    <HoverCard
      card={
        <>
          <p className="font-semibold text-violet-200">{organization.name}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-300">{description || <span className="italic text-stone-500">No description yet.</span>}</p>
        </>
      }
      triggerClassName="text-violet-300 decoration-violet-500/60 hover:text-violet-200 focus-visible:ring-violet-400"
      cardClassName="border-violet-800/70"
    >
      {children ?? organization.name}
    </HoverCard>
  );
}

/** Text with every mention of the given organizations' names turned into an OrganizationMention. */
export function OrganizationText({ text, organizations }: { text: string; organizations: readonly Organization[] }) {
  return (
    <>
      {splitMentions(text, organizations).map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <OrganizationMention key={i} organization={p.item}>
            {p.text}
          </OrganizationMention>
        ),
      )}
    </>
  );
}
