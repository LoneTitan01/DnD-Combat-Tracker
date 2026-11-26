import { useSyncExternalStore } from 'react';
import type { SyncedHotkeys } from '../../models';

// Keyboard shortcuts the DM can rebind on the Settings page. Kept per device, and shared with other
// devices only when "Sync keyboard shortcuts" is on: a laptop and a tablet may want different keys.

export const HOTKEY_ACTIONS = [
  { id: 'nextTurn', scope: 'Combat', label: 'Next turn', default: 'n' },
  { id: 'multiTarget', scope: 'Combat', label: 'Multi-target damage', default: 'm' },
  { id: 'close', scope: 'Combat', label: 'Close the open panel', default: 'Escape' },
  { id: 'bulkPrev', scope: 'Bulk add', label: 'Previous item', default: 'ArrowLeft' },
  { id: 'bulkNext', scope: 'Bulk add', label: 'Next item', default: 'ArrowRight' },
] as const;

export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number]['id'];
export type Hotkeys = Record<HotkeyAction, string>;

export const DEFAULT_HOTKEYS = Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a.id, a.default])) as Hotkeys;

const KEY = 'dm-combat-tracker:hotkeys';
/** When this device's shortcuts were last changed (by hand or by sync); missing = never. */
const STAMP_KEY = 'dm-combat-tracker:hotkeys-at';

/** Keys that can't be shortcuts: they move focus, press buttons, or only modify other keys. */
const RESERVED = new Set(['Tab', 'Enter', 'Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn', 'Dead', 'Unidentified', 'Process']);

/** The name a KeyboardEvent.key is stored and matched under: single characters lower-cased. */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function isBindable(key: string): boolean {
  return key !== '' && !RESERVED.has(key);
}

const LABELS: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: 'Backspace',
  Delete: 'Del',
};

/** How a key reads on screen: "N", "Esc", "←". */
export function keyLabel(key: string): string {
  return LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** The aria-keyshortcuts spelling of a key. */
export function ariaKey(key: string): string {
  if (key === ' ') return 'Space';
  return key.length === 1 ? key.toUpperCase() : key;
}

/** The other action in the same scope already using this key, if any. */
export function conflictFor(hotkeys: Hotkeys, action: HotkeyAction, key: string): HotkeyAction | null {
  const scope = HOTKEY_ACTIONS.find((a) => a.id === action)!.scope;
  const other = HOTKEY_ACTIONS.find((a) => a.id !== action && a.scope === scope && hotkeys[a.id] === key);
  return other ? other.id : null;
}

/** Bindings over the defaults, ignoring anything unknown or unusable. */
export function cleanHotkeys(saved: Record<string, unknown>): Hotkeys {
  const out = { ...DEFAULT_HOTKEYS };
  for (const a of HOTKEY_ACTIONS) {
    const k = saved[a.id];
    if (typeof k === 'string' && isBindable(k)) out[a.id] = normalizeKey(k);
  }
  return out;
}

/** Saved bindings (JSON) over the defaults. */
export function parseHotkeys(raw: string | null): Hotkeys {
  if (!raw) return { ...DEFAULT_HOTKEYS };
  try {
    return cleanHotkeys(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_HOTKEYS }; // corrupt value
  }
}

function read(): Hotkeys {
  try {
    return parseHotkeys(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_HOTKEYS };
  }
}

function readStamp(): number {
  try {
    return Number(localStorage.getItem(STAMP_KEY)) || 0;
  } catch {
    return 0;
  }
}

let memory: Hotkeys = read();
let stamp = readStamp();
const listeners = new Set<() => void>();
const editListeners = new Set<() => void>();

function store(next: Hotkeys, at: number) {
  memory = next;
  stamp = at;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    localStorage.setItem(STAMP_KEY, String(at));
  } catch {
    // Storage blocked: the change just won't survive a reload.
  }
  for (const fn of listeners) fn();
}

/** A change made on this device. */
export function saveHotkeys(next: Hotkeys): void {
  store(next, Date.now());
  for (const fn of editListeners) fn();
}

/** Called after the shortcuts are changed on this device (not when sync brings in others), so sync can upload soon. */
export function onHotkeysEdited(fn: () => void): () => void {
  editListeners.add(fn);
  return () => editListeners.delete(fn);
}

/** This device's shortcuts, as sync shares them. */
export function syncedHotkeys(): SyncedHotkeys {
  return { keys: { ...memory }, updatedAt: stamp };
}

/** Takes on newer shortcuts from another device. */
export function applySyncedHotkeys(h: SyncedHotkeys): void {
  store(cleanHotkeys(h.keys), h.updatedAt);
}

export function setHotkey(action: HotkeyAction, key: string): void {
  saveHotkeys({ ...memory, [action]: normalizeKey(key) });
}

export function resetHotkeys(): void {
  saveHotkeys({ ...DEFAULT_HOTKEYS });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STAMP_KEY) stamp = Number(e.newValue) || 0;
    if (e.key !== KEY) return;
    memory = parseHotkeys(e.newValue);
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function useHotkeys(): Hotkeys {
  return useSyncExternalStore(subscribe, () => memory);
}
