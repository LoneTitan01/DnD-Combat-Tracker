import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Card } from '../../components/ui';
import { connectSync, deleteCloudCopy, disconnectSync, syncNow, useSyncState, type SyncState } from '../../sync/manager';

/** "just now", "3 min ago", "2 h ago", or a date. */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
}

/** Re-renders every 30 s so "x min ago" stays current. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function syncStatusText(s: SyncState, now: number): string {
  switch (s.phase) {
    case 'unconfigured':
      return 'Not available in this copy of the app';
    case 'off':
      return 'Off';
    case 'connecting':
      return 'Connecting…';
    case 'paused':
      return 'Paused: Google needs you to sign in again';
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return `Synced ${s.lastSyncedAt ? timeAgo(s.lastSyncedAt, now) : ''}`.trim();
    case 'error':
      return 'Sync failed';
  }
}

/** Compact status in the header; hidden while sync is off. */
export function SyncBadge() {
  const s = useSyncState();
  const now = useNow();
  if (s.phase === 'off' || s.phase === 'unconfigured') return null;
  if (s.phase === 'paused') {
    return (
      <Button
        className="whitespace-nowrap px-2 py-1 text-xs"
        disabled={!s.ready}
        title="Google sign-ins from a web page last about an hour. Sign in again to keep syncing."
        onClick={() => void connectSync()}
      >
        ☁ Reconnect sync
      </Button>
    );
  }
  const color = s.phase === 'error' ? 'text-red-300' : s.phase === 'synced' ? 'text-emerald-300' : 'text-stone-400';
  return (
    <Link
      to="/settings"
      className={`whitespace-nowrap rounded-md px-2 py-1 text-xs hover:bg-stone-800 ${color}`}
      aria-label={`Sync: ${syncStatusText(s, now)}`}
      title={s.error ?? syncStatusText(s, now)}
    >
      ☁ {s.phase === 'synced' ? 'Synced' : s.phase === 'error' ? 'Sync failed' : 'Syncing…'}
    </Link>
  );
}

/** The Sync section of the Settings page. */
export function SyncSettings() {
  const s = useSyncState();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const connected = s.phase !== 'off' && s.phase !== 'unconfigured' && s.phase !== 'connecting';

  const removeCloud = async () => {
    if (!confirm('Delete the synced copy from Google Drive and stop syncing? The data on this device stays.')) return;
    setBusy(true);
    try {
      await deleteCloudCopy();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="settings-sync" className="flex flex-col gap-4">
      <h2 id="settings-sync" className="font-display text-xl font-semibold text-stone-100">
        Sync
      </h2>
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-stone-300">
          Optional. Sign in with a Google account to keep your stat blocks, party, encounters and combats the same on every
          browser where you sign in with that account. The data is kept in a hidden app folder in that account’s Google
          Drive, which only this app can see. Without sync, everything stays on this device only.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-stone-500">Status</dt>
          <dd className="text-stone-100" role="status" aria-label="Sync status">
            {syncStatusText(s, now)}
          </dd>
          {s.email && (
            <>
              <dt className="text-stone-500">Account</dt>
              <dd className="text-stone-100">{s.email}</dd>
            </>
          )}
        </dl>
        {s.error && (
          <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
            {s.error}
          </p>
        )}

        {s.phase === 'unconfigured' ? (
          <p className="text-sm text-stone-400">
            This build has no Google client ID. See “Google sync” in the README for the one-time setup, then rebuild.
          </p>
        ) : !connected ? (
          <div>
            <Button variant="primary" disabled={!s.ready || s.phase === 'connecting'} onClick={() => void connectSync()}>
              {s.ready ? 'Connect Google account' : 'Loading Google sign-in…'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {s.phase === 'paused' ? (
              <Button variant="primary" disabled={!s.ready} onClick={() => void connectSync()}>
                Reconnect
              </Button>
            ) : (
              <Button variant="primary" disabled={s.phase === 'syncing'} onClick={() => void syncNow()}>
                Sync now
              </Button>
            )}
            <Button onClick={() => void disconnectSync()}>Disconnect</Button>
            <Button variant="danger" className="ml-auto" disabled={busy || s.phase === 'paused'} onClick={() => void removeCloud()}>
              Delete synced copy
            </Button>
          </div>
        )}
      </Card>

      <Card className="text-sm text-stone-400">
        <h3 className="mb-2 font-semibold text-stone-200">How it works</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Changes upload a few seconds after you make them, and other devices pick them up when they open the app, come back to it, or every few minutes.</li>
          <li>If the same item was changed on two devices, the most recent change wins. Deleting something deletes it everywhere.</li>
          <li>Run a combat on one device at a time; an open combat screen keeps its own copy and saves over changes from elsewhere.</li>
          <li>Google sign-ins from a web page last about an hour. After that, click “Reconnect sync” in the header to carry on.</li>
          <li>Disconnecting keeps everything on this device and in Google Drive. Connecting again on any device merges the two.</li>
        </ul>
      </Card>
    </section>
  );
}
