import { useSyncExternalStore } from 'react';
import { onLocalChange } from '../db';
import { applySyncedHotkeys, onHotkeysEdited, syncedHotkeys } from '../features/settings/hotkeys';
import { syncOnce, type HotkeySync } from './engine';
import {
  AuthExpiredError,
  DriveRemote,
  GOOGLE_CLIENT_ID,
  googleAccountEmail,
  googleSignInReady,
  loadGoogleSignIn,
  requestAccessToken,
  revokeAccessToken,
  type AccessToken,
} from './google';

/*
 * Optional sync with the user's Google account. Off until they connect. While connected it syncs on
 * start, a few seconds after each local change, when the app comes back into view or online, and
 * every few minutes. Google's browser tokens last about an hour and can only be renewed from a
 * click, so after that the header shows a Reconnect button.
 */

export type SyncPhase =
  | 'unconfigured' // no Google client ID in this build
  | 'off' // not connected
  | 'connecting'
  | 'paused' // connected before, needs a click to sign in again
  | 'syncing'
  | 'synced'
  | 'error';

export interface SyncState {
  phase: SyncPhase;
  email?: string;
  lastSyncedAt?: number;
  error?: string;
  /** Google's sign-in script is loaded, so Connect / Reconnect can open the popup. */
  ready: boolean;
  /** This device shares its keyboard shortcuts through sync. */
  syncHotkeys: boolean;
}

const PREFS_KEY = 'dm-sync';
const TOKEN_KEY = 'dm-sync-token';
const CHANGE_DELAY = 4000;
const POLL_EVERY = 5 * 60_000;

interface Prefs {
  enabled: boolean;
  /** Survives disconnecting: it's a preference for this device, not part of the connection. */
  syncHotkeys?: boolean;
  email?: string;
  lastSyncedAt?: number;
}

// Storage can be unavailable (private windows, blocked site data); sync then just doesn't persist.
function read<T>(store: () => Storage, key: string): T | null {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(store: () => Storage, key: string, value: unknown) {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

let prefs: Prefs = read<Prefs>(() => localStorage, PREFS_KEY) ?? { enabled: false };
// The token is kept for this tab session only.
let token: AccessToken | null = read<AccessToken>(() => sessionStorage, TOKEN_KEY);

let state: SyncState = {
  phase: !GOOGLE_CLIENT_ID ? 'unconfigured' : prefs.enabled ? 'paused' : 'off',
  email: prefs.email,
  lastSyncedAt: prefs.lastSyncedAt,
  ready: false,
  syncHotkeys: !!prefs.syncHotkeys,
};
const subscribers = new Set<() => void>();

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const fn of subscribers) fn();
}
function savePrefs(p: Prefs) {
  prefs = p;
  write(() => localStorage, PREFS_KEY, p);
}
function saveToken(t: AccessToken | null) {
  token = t;
  write(() => sessionStorage, TOKEN_KEY, t);
}
const tokenValid = () => !!token && token.expiresAt - 60_000 > Date.now();

export const getSyncState = (): SyncState => state;
export function subscribeSync(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState);
}

// ---------- syncing ----------

const HOTKEYS: HotkeySync = { local: syncedHotkeys, apply: applySyncedHotkeys };

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule(delay: number) {
  if (!prefs.enabled || !GOOGLE_CLIENT_ID) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

/** Syncs now (or right after a sync that's already running). */
export function syncNow(): Promise<void> {
  if (!prefs.enabled || !GOOGLE_CLIENT_ID) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (!tokenValid()) {
        set({ phase: 'paused', error: undefined });
        return;
      }
      set({ phase: 'syncing', error: undefined });
      try {
        await syncOnce(new DriveRemote(() => token!.accessToken), undefined, prefs.syncHotkeys ? HOTKEYS : undefined);
        savePrefs({ ...prefs, lastSyncedAt: Date.now() });
        set({ phase: 'synced', lastSyncedAt: prefs.lastSyncedAt });
      } catch (e) {
        if (e instanceof AuthExpiredError) {
          saveToken(null);
          set({ phase: 'paused' });
        } else {
          set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Signs in with Google and starts syncing. Must be called directly from a click, since it opens
 * Google's popup.
 */
export async function connectSync(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) return;
  const wasPhase = state.phase;
  set({ phase: 'connecting', error: undefined });
  try {
    const t = await requestAccessToken(prefs.email);
    saveToken(t);
    const email = (await googleAccountEmail(t.accessToken)) ?? prefs.email;
    savePrefs({ ...prefs, enabled: true, email });
    set({ email });
  } catch (e) {
    set({ phase: wasPhase === 'connecting' ? 'off' : wasPhase, error: e instanceof Error ? e.message : String(e) });
    return;
  }
  await syncNow();
}

/** Turns sharing this device's keyboard shortcuts through sync on or off, syncing right away when on. */
export function setSyncHotkeys(on: boolean): void {
  savePrefs({ ...prefs, syncHotkeys: on });
  set({ syncHotkeys: on });
  if (on) schedule(0);
}

/** Stops syncing on this device. Its data stays; so does the copy in Google Drive. */
export async function disconnectSync(): Promise<void> {
  clearTimeout(timer);
  const t = token;
  saveToken(null);
  savePrefs({ enabled: false, syncHotkeys: prefs.syncHotkeys });
  set({ phase: GOOGLE_CLIENT_ID ? 'off' : 'unconfigured', email: undefined, lastSyncedAt: undefined, error: undefined });
  if (t) await revokeAccessToken(t.accessToken);
}

/** Deletes the synced copy from Google Drive, then disconnects. This device's data stays. */
export async function deleteCloudCopy(): Promise<void> {
  if (!tokenValid()) throw new Error('Reconnect first, then delete.');
  await new DriveRemote(() => token!.accessToken).deleteFile();
  await disconnectSync();
}

let started = false;

/** Starts background syncing. Called once by the app shell (not by the player-facing page). */
export function startSync(): void {
  if (started || !GOOGLE_CLIENT_ID) return;
  started = true;
  loadGoogleSignIn().then(
    () => set({ ready: googleSignInReady() }),
    (e: Error) => set({ ready: false, ...(prefs.enabled ? { error: e.message } : {}) }),
  );
  onLocalChange(() => schedule(CHANGE_DELAY));
  onHotkeysEdited(() => {
    if (prefs.syncHotkeys) schedule(CHANGE_DELAY);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
  });
  window.addEventListener('online', () => schedule(0));
  setInterval(() => schedule(0), POLL_EVERY);
  if (prefs.enabled) void syncNow();
}
