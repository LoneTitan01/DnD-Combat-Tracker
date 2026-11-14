import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { db } from '../../db';
import { resolveCampaign, sortCampaigns } from '../../logic';
import type { Campaign, ID } from '../../models';

// Which campaign this device is working in. Per device on purpose: two DMs sharing a Drive account
// (or one DM on two screens) can each look at a different campaign.
const KEY = 'dm-combat-tracker:campaign';
const listeners = new Set<() => void>();

function read(): ID | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function selectCampaign(id: ID): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the choice just won't survive a reload.
  }
  memory = id;
  for (const fn of listeners) fn();
}

let memory: ID | null = read();

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = e.newValue;
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export interface CampaignState {
  /** Every campaign, oldest first. Undefined while loading. */
  campaigns: Campaign[] | undefined;
  /** The one this device is working in. Undefined while loading (or in the moment before the first is created). */
  campaign: Campaign | undefined;
  select: (id: ID) => void;
}

export function useCampaign(): CampaignState {
  const chosen = useSyncExternalStore(subscribe, () => memory);
  const raw = useLiveQuery(() => db.campaigns.toArray());
  const campaigns = useMemo(() => (raw ? sortCampaigns(raw) : undefined), [raw]);
  const campaign = campaigns ? resolveCampaign(campaigns, chosen) : undefined;
  return { campaigns, campaign, select: useCallback(selectCampaign, []) };
}
