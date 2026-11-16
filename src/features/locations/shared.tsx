import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { db } from '../../db';
import { inCampaign } from '../../logic';
import type { ID, Location } from '../../models';
import { useCampaign } from '../campaigns/useCampaign';

/** The current campaign's locations. Undefined while loading. */
export function useLocations(): { locations: Location[] | undefined; campaignId: ID | undefined } {
  const { campaign } = useCampaign();
  const locations = useLiveQuery(
    async () => (campaign ? (await db.locations.toArray()).filter(inCampaign(campaign.id)) : undefined),
    [campaign?.id],
  );
  return { locations, campaignId: campaign?.id };
}

export const locationPath = (id: ID) => `/locations/${id}`;

/** Where an NPC's name leads: the NPC list, searched for that name. */
export const npcPath = (name: string) => `/npcs?${new URLSearchParams({ q: name })}`;

export function LocationLink({ location }: { location: Location }) {
  return (
    <Link to={locationPath(location.id)} className="text-amber-400 hover:underline">
      {location.name}
    </Link>
  );
}

export function NpcLink({ name }: { name: string }) {
  return (
    <Link to={npcPath(name)} className="text-amber-400 hover:underline">
      {name}
    </Link>
  );
}
