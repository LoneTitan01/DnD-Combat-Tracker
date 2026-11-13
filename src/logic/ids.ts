import type { ID } from '../models';

/** crypto.randomUUID needs a secure context; fall back for file:// or plain-http LAN use. */
export function newId(): ID {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
