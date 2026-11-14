import { DEFAULT_CAMPAIGN_ID, type Campaign, type ID } from '../models';
import { newId } from './ids';

/** The campaign a player, encounter or combat belongs to. Records from before campaigns existed belong to the default one. */
export const campaignOf = (r: { campaignId?: ID }): ID => r.campaignId ?? DEFAULT_CAMPAIGN_ID;

/** Filter predicate: records in the given campaign. */
export const inCampaign =
  (id: ID | undefined) =>
  (r: { campaignId?: ID }): boolean =>
    id !== undefined && campaignOf(r) === id;

export function newCampaign(name: string, description = ''): Campaign {
  const now = Date.now();
  return { id: newId(), name: name.trim(), description: description.trim(), createdAt: now, updatedAt: now };
}

/**
 * The campaign that pre-campaign data is moved into, and that a fresh install starts with. Stamped 0 so
 * any real copy (or a deletion) from another device wins over this placeholder when syncing.
 */
export function defaultCampaign(): Campaign {
  return { id: DEFAULT_CAMPAIGN_ID, name: 'My Campaign', description: '', createdAt: 0, updatedAt: 0 };
}

/** Oldest first, then by name, so the list (and the fallback choice) is stable. */
export function sortCampaigns(list: readonly Campaign[]): Campaign[] {
  return [...list].sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
}

/** The chosen campaign if it still exists, otherwise the first one. */
export function resolveCampaign(list: readonly Campaign[], chosen: ID | null): Campaign | undefined {
  return list.find((c) => c.id === chosen) ?? sortCampaigns(list)[0];
}
