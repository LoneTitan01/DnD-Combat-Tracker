import { db, mergeIntoLocal, type TrackerDB } from '../db';
import { emptySyncData } from '../logic/sync';
import type { SyncFile, SyncedHotkeys } from '../models';

/** Where the shared copy lives. Google Drive in the app; an in-memory object in tests. */
export interface SyncRemote {
  load(): Promise<SyncFile | null>;
  save(file: SyncFile): Promise<void>;
}

/** This device's keyboard shortcuts, when it shares them through sync. */
export interface HotkeySync {
  local(): SyncedHotkeys;
  /** Replaces this device's shortcuts with newer ones from another device. */
  apply(h: SyncedHotkeys): void;
}

export interface SyncOutcome {
  /** This device's data changed (other devices had newer edits). */
  pulled: boolean;
  /** The shared copy was updated with this device's edits. */
  pushed: boolean;
}

/**
 * One round trip: download, merge into this device, upload the merge if the shared copy is behind.
 * With `hotkeys`, the newer of this device's shortcuts and the shared ones wins on both sides.
 * Without it, the shared shortcuts are passed through untouched for the devices that do use them.
 */
export async function syncOnce(remote: SyncRemote, database: TrackerDB = db, hotkeys?: HotkeySync): Promise<SyncOutcome> {
  const theirs = await remote.load();
  const { merged, localChanged, remoteChanged } = await mergeIntoLocal(theirs ?? emptySyncData(), database);
  let shared = theirs?.hotkeys;
  let pulled = localChanged;
  let push = !theirs || remoteChanged;
  if (hotkeys) {
    const mine = hotkeys.local();
    if (!shared || mine.updatedAt > shared.updatedAt) {
      shared = mine;
      push = true;
    } else if (shared.updatedAt > mine.updatedAt) {
      hotkeys.apply(shared);
      pulled = true;
    }
  }
  if (push) await remote.save({ app: 'dm-combat-tracker', format: 1, savedAt: Date.now(), ...merged, ...(shared ? { hotkeys: shared } : {}) });
  return { pulled, pushed: push };
}
