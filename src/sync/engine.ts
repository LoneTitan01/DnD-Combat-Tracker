import { db, mergeIntoLocal, type TrackerDB } from '../db';
import { emptySyncData } from '../logic/sync';
import type { SyncFile } from '../models';

/** Where the shared copy lives. Google Drive in the app; an in-memory object in tests. */
export interface SyncRemote {
  load(): Promise<SyncFile | null>;
  save(file: SyncFile): Promise<void>;
}

export interface SyncOutcome {
  /** This device's data changed (other devices had newer edits). */
  pulled: boolean;
  /** The shared copy was updated with this device's edits. */
  pushed: boolean;
}

/** One round trip: download, merge into this device, upload the merge if the shared copy is behind. */
export async function syncOnce(remote: SyncRemote, database: TrackerDB = db): Promise<SyncOutcome> {
  const theirs = await remote.load();
  const { merged, localChanged, remoteChanged } = await mergeIntoLocal(theirs ?? emptySyncData(), database);
  const push = !theirs || remoteChanged;
  if (push) await remote.save({ app: 'dm-combat-tracker', format: 1, savedAt: Date.now(), ...merged });
  return { pulled: localChanged, pushed: push };
}
