import { useState } from 'react';
import { Button, Card } from '../../components/ui';
import { joinLink, type HostStatus, type RemoteHost } from './useRemoteHost';

const STATUS_TEXT: Record<HostStatus, string> = {
  off: 'Not sharing',
  starting: 'Connecting…',
  open: 'Sharing',
  taken: 'This code is in use, maybe by this combat in another tab. Close that tab, or use a new code.',
  notFound: 'Connection problem.',
  network: "Can't reach the connection server. Check the internet connection; sharing needs it to let players join.",
  unsupported: "This browser can't share peer-to-peer.",
  other: 'Something went wrong with the connection. Try a new code.',
};

/** Header button for the combat screen: shows how many player devices are connected. */
export function ShareButton({ host, open, onClick }: { host: RemoteHost; open: boolean; onClick: () => void }) {
  return (
    <Button aria-expanded={open} onClick={onClick} title="Let players follow this combat on their own devices">
      📱 Players' devices
      {host.code && (
        <span
          className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${host.status === 'open' ? 'bg-emerald-700 text-white' : 'bg-stone-700 text-stone-300'}`}
          aria-label="Connected devices"
        >
          {host.devices}
        </span>
      )}
    </Button>
  );
}

export function SharePanel({ host }: { host: RemoteHost }) {
  const [copied, setCopied] = useState(false);

  if (!host.code) {
    return (
      <Card className="mb-4 flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-stone-300">
          Players can follow this combat on their phones and set their own initiative and conditions. They open the
          app's <strong>Join</strong> page and enter a code. Keep this tab open while you play.
        </p>
        <Button variant="primary" onClick={host.start}>
          Start sharing
        </Button>
      </Card>
    );
  }

  const link = joinLink(host.code);
  const problem = host.status !== 'open' && host.status !== 'starting';
  return (
    <Card className="mb-4 flex flex-col gap-3" aria-label="Sharing with players">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-stone-400">Join code</p>
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-amber-300" aria-label="Join code">
            {host.code}
          </p>
        </div>
        <p className={`flex-1 text-sm ${problem ? 'text-red-300' : 'text-stone-300'}`} role="status" aria-label="Sharing status">
          {host.status === 'open'
            ? host.devices === 1
              ? '1 device connected'
              : `${host.devices} devices connected`
            : STATUS_TEXT[host.status]}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </Button>
          <Button variant="ghost" onClick={host.newCode} title="Disconnects everyone; players will need the new code">
            New code
          </Button>
          <Button variant="danger" onClick={host.stop}>
            Stop sharing
          </Button>
        </div>
      </div>
      <p className="break-all text-xs text-stone-500">
        Or open <span className="text-stone-300">{link}</span>
      </p>
    </Card>
  );
}
