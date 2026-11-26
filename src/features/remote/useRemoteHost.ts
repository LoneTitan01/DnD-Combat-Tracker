import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyPlayerAction,
  hostPeerId,
  makeJoinCode,
  parsePlayerMessage,
  remoteView,
  type HostMessage,
  type TemplateNames,
} from '../../logic';
import type { Combat, ID } from '../../models';
import type { UpdateCombat } from '../combat/useCombat';
import { getTransport, type Link, type TransportError } from './transport';

export type HostStatus = 'off' | 'starting' | 'open' | TransportError;

export interface RemoteHost {
  code: string | null;
  status: HostStatus;
  /** Player devices connected right now. */
  devices: number;
  start(): void;
  stop(): void;
  /** Gives up the current code (e.g. it's stuck in another tab) and shares under a fresh one. */
  newCode(): void;
}

const storageKey = (combatId: ID) => `dm-combat-tracker:share:${combatId}`;

function readCode(combatId: ID): string | null {
  try {
    return localStorage.getItem(storageKey(combatId));
  } catch {
    return null;
  }
}

function writeCode(combatId: ID, code: string | null): void {
  try {
    if (code) localStorage.setItem(storageKey(combatId), code);
    else localStorage.removeItem(storageKey(combatId));
  } catch {
    // Private mode: sharing still works, it just won't resume after a reload.
  }
}

/** A reloaded tab can find its own old code still registered for a few seconds; retry before giving up. */
const TAKEN_RETRIES = 5;
const RETRY_MS = 3000;

/**
 * For the DM's combat screen: shares the combat with player devices under a join code. Sharing is
 * remembered per combat, so reopening the combat (or reloading) resumes it under the same code.
 * Player changes go through `update`, like the DM's own clicks.
 */
export function useRemoteHost(
  combat: Combat | null | undefined,
  templates: TemplateNames | undefined,
  update: UpdateCombat,
): RemoteHost {
  const combatId = combat?.id ?? null;
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<HostStatus>('off');
  const [devices, setDevices] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const links = useRef(new Set<Link>());

  const latest = useRef({ combat, templates });
  latest.current = { combat, templates };
  const viewMessage = (): HostMessage | null => {
    const c = latest.current.combat;
    return c ? { type: 'view', view: remoteView(c, latest.current.templates) } : null;
  };

  // Resume sharing for this combat if it was on.
  useEffect(() => {
    setCode(combatId ? readCode(combatId) : null);
    setAttempt(0);
  }, [combatId]);

  useEffect(() => {
    if (!code) {
      setStatus('off');
      return;
    }
    setStatus('starting');
    let retry: ReturnType<typeof setTimeout> | undefined;
    const handle = getTransport().host(hostPeerId(code), {
      onReady: () => {
        setStatus('open');
        setAttempt(0);
      },
      onError: (e) => {
        if (e === 'taken' && attempt < TAKEN_RETRIES) {
          retry = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
          return;
        }
        setStatus(e);
      },
      onLink: (link) => {
        links.current.add(link);
        setDevices(links.current.size);
        const msg = viewMessage();
        if (msg) link.send(msg);
        return {
          onData: (data) => {
            const m = parsePlayerMessage(data);
            if (!m) return;
            if (m.type === 'hello') {
              const v = viewMessage();
              if (v) link.send(v);
            } else {
              update((c) => applyPlayerAction(c, m.action));
            }
          },
          onClose: () => {
            links.current.delete(link);
            setDevices(links.current.size);
          },
        };
      },
    });
    const open = links.current;
    return () => {
      clearTimeout(retry);
      handle.close();
      open.clear();
      setDevices(0);
    };
    // `attempt` re-runs this to retry a taken code.
  }, [code, attempt, update]);

  // Every change on the DM's side goes out to every device.
  useEffect(() => {
    const msg = viewMessage();
    if (!msg) return;
    for (const l of links.current) l.send(msg);
  }, [combat, templates]);

  const share = useCallback(
    (next: string | null) => {
      if (!combatId) return;
      if (!next) for (const l of links.current) l.send({ type: 'closed' } satisfies HostMessage);
      writeCode(combatId, next);
      setAttempt(0);
      setCode(next);
    },
    [combatId],
  );

  return {
    code,
    status,
    devices,
    start: () => share(code ?? makeJoinCode()),
    stop: () => share(null),
    newCode: () => share(makeJoinCode()),
  };
}

export function joinLink(code: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join?code=${code}`;
}
