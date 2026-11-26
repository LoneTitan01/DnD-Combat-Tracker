import { useCallback, useEffect, useRef, useState } from 'react';
import { hostPeerId, type HostMessage, type PlayerAction, type PlayerMessage, type RemoteView } from '../../logic';
import { getTransport, type Link } from './transport';

export type ClientStatus =
  | 'connecting'
  | 'connected'
  /** Lost the DM after being connected; trying again. */
  | 'reconnecting'
  /** Nobody is sharing under this code (yet); trying again. */
  | 'notFound'
  | 'network'
  | 'unsupported'
  /** The DM stopped sharing. */
  | 'closed';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseHostMessage(data: unknown): HostMessage | null {
  if (!isObj(data)) return null;
  if (data.type === 'closed') return { type: 'closed' };
  if (data.type === 'view' && isObj(data.view) && Array.isArray(data.view.players) && Array.isArray(data.view.order)) {
    return data as HostMessage;
  }
  return null;
}

const backoff = (n: number) => Math.min(15_000, 2000 * 2 ** n);

/** For a player device: follows the DM's combat shared under `code`, reconnecting when the link drops. */
export function useRemoteClient(code: string): {
  status: ClientStatus;
  view: RemoteView | null;
  send(action: PlayerAction): void;
  /** Connect again now, e.g. after the DM stopped and restarted sharing. */
  retry(): void;
} {
  const [status, setStatus] = useState<ClientStatus>('connecting');
  const [view, setView] = useState<RemoteView | null>(null);
  const link = useRef<Link | null>(null);
  // Bumped to make a fresh connection attempt.
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);
  const everConnected = useRef(false);

  useEffect(() => {
    setView(null);
    everConnected.current = false;
    failures.current = 0;
  }, [code]);

  useEffect(() => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => {
      if (done) return;
      done = true;
      link.current?.close();
      link.current = null;
      timer = setTimeout(() => setAttempt((a) => a + 1), backoff(failures.current++));
    };
    const l = getTransport().connect(hostPeerId(code), {
      onOpen: () => {
        failures.current = 0;
        everConnected.current = true;
        setStatus('connected');
        l.send({ type: 'hello' } satisfies PlayerMessage);
      },
      onData: (data) => {
        const m = parseHostMessage(data);
        if (m?.type === 'view') setView(m.view);
        else if (m?.type === 'closed') {
          done = true;
          setStatus('closed');
          l.close();
        }
      },
      onClose: () => {
        if (done) return;
        setStatus('reconnecting');
        again();
      },
      onError: (e) => {
        if (done) return;
        if (e === 'unsupported') {
          done = true;
          setStatus('unsupported');
          return;
        }
        setStatus(e === 'notFound' ? (everConnected.current ? 'reconnecting' : 'notFound') : e === 'network' ? 'network' : 'reconnecting');
        again();
      },
    });
    link.current = l;
    return () => {
      done = true;
      clearTimeout(timer);
      l.close();
      if (link.current === l) link.current = null;
    };
  }, [code, attempt]);

  const statusRef = useRef(status);
  statusRef.current = status;
  const retry = useCallback(() => {
    failures.current = 0;
    setStatus((s) => (s === 'closed' ? 'connecting' : s));
    setAttempt((a) => a + 1);
  }, []);

  // A phone that slept or came back online shouldn't wait out the backoff.
  useEffect(() => {
    const kick = () => {
      const s = statusRef.current;
      if (document.visibilityState === 'visible' && (s === 'reconnecting' || s === 'notFound' || s === 'network')) retry();
    };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', kick);
    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', kick);
    };
  }, [retry]);

  const send = useCallback((action: PlayerAction) => {
    link.current?.send({ type: 'action', action } satisfies PlayerMessage);
  }, []);

  return { status, view, send, retry };
}
