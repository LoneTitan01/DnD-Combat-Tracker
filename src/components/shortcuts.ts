import { useEffect, useRef } from 'react';

/** True when a key press belongs to a form control the user is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
}

/**
 * Single-key shortcuts (case-insensitive), ignored while typing or with Ctrl/Alt/Meta held.
 * Escape inside a text box blurs it first, so a second Escape reaches the page.
 */
export function useShortcuts(keys: Record<string, () => void>): void {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const fn = latest.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
