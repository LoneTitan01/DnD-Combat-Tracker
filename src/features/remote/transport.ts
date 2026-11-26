/**
 * The link between the DM's screen and player devices. Real use goes peer-to-peer over WebRTC
 * (PeerJS, with its free public server only for the handshake); end-to-end tests swap in a
 * BroadcastChannel fake so they never touch the network.
 */

export type TransportError =
  /** Hosting: another tab or device already holds this code. */
  | 'taken'
  /** Joining: nobody is hosting this code right now. */
  | 'notFound'
  /** Couldn't reach the signalling server (offline, blocked). */
  | 'network'
  | 'unsupported'
  | 'other';

export interface Link {
  send(data: unknown): void;
  close(): void;
}

export interface LinkEvents {
  onData(data: unknown): void;
  onClose(): void;
}

export interface HostEvents {
  onReady(): void;
  onError(e: TransportError): void;
  /** A player device connected; return what to do with its messages. */
  onLink(link: Link): LinkEvents;
}

export interface ClientEvents extends LinkEvents {
  onOpen(): void;
  onError(e: TransportError): void;
}

export interface Transport {
  host(id: string, events: HostEvents): { close(): void };
  connect(id: string, events: ClientEvents): Link;
}

declare global {
  interface Window {
    /** Set by end-to-end tests to use the same-browser fake instead of PeerJS. */
    __DMCT_TRANSPORT__?: 'broadcast';
  }
}

export function getTransport(): Transport {
  return typeof window !== 'undefined' && window.__DMCT_TRANSPORT__ === 'broadcast' ? broadcastTransport : peerTransport;
}

// ---------- PeerJS ----------

type PeerModule = typeof import('peerjs');
let peerModule: Promise<PeerModule> | null = null;
// Loaded on first use so the rest of the app doesn't pay for it.
const loadPeer = () => (peerModule ??= import('peerjs'));

function errorKind(type: string | undefined): TransportError {
  switch (type) {
    case 'unavailable-id':
      return 'taken';
    case 'peer-unavailable':
      return 'notFound';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'network';
    case 'browser-incompatible':
      return 'unsupported';
    default:
      return 'other';
  }
}

type DataConn = import('peerjs').DataConnection;

function wrap(conn: DataConn): Link {
  return {
    send: (d) => {
      if (conn.open) void conn.send(d);
    },
    close: () => conn.close(),
  };
}

const peerTransport: Transport = {
  host(id, events) {
    let closed = false;
    let peer: import('peerjs').Peer | null = null;
    void loadPeer().then(
      ({ Peer }) => {
        if (closed) return;
        const p = new Peer(id);
        peer = p;
        p.on('open', () => events.onReady());
        p.on('connection', (conn) => {
          const link = wrap(conn);
          const handlers = events.onLink(link);
          conn.on('data', (d) => handlers.onData(d));
          conn.on('close', () => handlers.onClose());
          conn.on('error', () => handlers.onClose());
        });
        p.on('error', (err) => events.onError(errorKind((err as { type?: string }).type)));
        // Losing the signalling server doesn't drop existing players; reconnect so new ones can join.
        p.on('disconnected', () => {
          setTimeout(() => {
            if (!closed && !p.destroyed && p.disconnected) p.reconnect();
          }, 3000);
        });
      },
      () => events.onError('unsupported'),
    );
    return {
      close() {
        closed = true;
        peer?.destroy();
      },
    };
  },

  connect(id, events) {
    let closed = false;
    let peer: import('peerjs').Peer | null = null;
    let conn: DataConn | null = null;
    void loadPeer().then(
      ({ Peer }) => {
        if (closed) return;
        const p = new Peer();
        peer = p;
        p.on('open', () => {
          const c = p.connect(id, { reliable: true });
          conn = c;
          c.on('open', () => events.onOpen());
          c.on('data', (d) => events.onData(d));
          c.on('close', () => events.onClose());
          c.on('error', () => events.onClose());
        });
        p.on('error', (err) => events.onError(errorKind((err as { type?: string }).type)));
      },
      () => events.onError('unsupported'),
    );
    return {
      send: (d) => {
        if (conn?.open) void conn.send(d);
      },
      close() {
        closed = true;
        peer?.destroy();
      },
    };
  },
};

// ---------- BroadcastChannel fake (tests) ----------

type Frame =
  | { t: 'connect'; from: string }
  | { t: 'accept'; to: string }
  | { t: 'data'; from?: string; to?: string; d: unknown }
  | { t: 'close'; from?: string; to?: string };

const randomId = () => Math.random().toString(36).slice(2);

const broadcastTransport: Transport = {
  host(id, events) {
    const ch = new BroadcastChannel(`dmct-fake-peer:${id}`);
    const links = new Map<string, LinkEvents>();
    ch.onmessage = (e: MessageEvent<Frame>) => {
      const f = e.data;
      if (f.t === 'connect') {
        const from = f.from;
        const handlers = events.onLink({
          send: (d) => ch.postMessage({ t: 'data', to: from, d } satisfies Frame),
          close: () => {
            links.delete(from);
            ch.postMessage({ t: 'close', to: from } satisfies Frame);
          },
        });
        links.set(from, handlers);
        ch.postMessage({ t: 'accept', to: from } satisfies Frame);
      } else if (f.t === 'data' && f.from) {
        links.get(f.from)?.onData(f.d);
      } else if (f.t === 'close' && f.from) {
        links.get(f.from)?.onClose();
        links.delete(f.from);
      }
    };
    setTimeout(() => events.onReady(), 0);
    return {
      close() {
        for (const [to, l] of links) {
          ch.postMessage({ t: 'close', to } satisfies Frame);
          l.onClose();
        }
        ch.close();
      },
    };
  },

  connect(id, events) {
    const me = randomId();
    const ch = new BroadcastChannel(`dmct-fake-peer:${id}`);
    let open = false;
    let closed = false;
    const timer = setTimeout(() => {
      if (!open && !closed) events.onError('notFound');
    }, 1500);
    ch.onmessage = (e: MessageEvent<Frame>) => {
      const f = e.data;
      if (!('to' in f) || f.to !== me) return;
      if (f.t === 'accept') {
        open = true;
        clearTimeout(timer);
        events.onOpen();
      } else if (f.t === 'data') {
        events.onData(f.d);
      } else if (f.t === 'close') {
        open = false;
        events.onClose();
      }
    };
    ch.postMessage({ t: 'connect', from: me } satisfies Frame);
    return {
      send: (d) => {
        if (open) ch.postMessage({ t: 'data', from: me, d } satisfies Frame);
      },
      close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        // Even before the accept arrives: the host may already have counted this link.
        ch.postMessage({ t: 'close', from: me } satisfies Frame);
        ch.close();
      },
    };
  },
};
