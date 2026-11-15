import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { splitSpellMentions } from '../../logic';
import type { Spell } from '../../models';
import { SpellCard } from './SpellCard';

const WIDTH = 340;
const GAP = 6;
const MARGIN = 8;

interface Place {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/** Where the card goes: under the name if it fits (or has more room there), otherwise above. */
function placeFor(anchor: DOMRect): Place {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - 2 * MARGIN);
  const left = Math.min(Math.max(anchor.left, MARGIN), vw - width - MARGIN);
  const below = vh - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  return below >= 320 || below >= above
    ? { left, top: anchor.bottom + GAP, maxHeight: below }
    : { left, bottom: vh - anchor.top + GAP, maxHeight: above };
}

/**
 * A spell name that shows the spell's description on hover or keyboard focus. Clicking (or tapping,
 * on touch screens) pins it open until clicking elsewhere or pressing Escape.
 */
export function SpellMention({ spell, children }: { spell: Spell; children?: ReactNode }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const id = useId();
  const open = hover || pinned;

  const enter = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setHover(true);
  }, []);
  // A short delay lets the pointer cross the gap into the card (to scroll a long description).
  const leave = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHover(false), 120);
  }, []);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => anchor.current && setPlace(placeFor(anchor.current.getBoundingClientRect()));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !card.current?.contains(t)) setPinned(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinned(false);
      setHover(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [pinned]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setPinned(false);
            setHover(false);
          }
        }}
        onClick={() => {
          if (!pinned) return setPinned(true);
          setPinned(false);
          setHover(false);
        }}
        className="cursor-help rounded-sm text-sky-300 underline decoration-sky-500/60 decoration-dotted underline-offset-2 hover:text-sky-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
      >
        {children ?? spell.name}
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={card}
            id={id}
            role="tooltip"
            onMouseEnter={enter}
            onMouseLeave={leave}
            style={{ left: place.left, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, width: Math.min(WIDTH, window.innerWidth - 2 * MARGIN) }}
            className="fixed z-50 overflow-y-auto rounded-lg border border-sky-800/70 bg-stone-900 p-3 text-left shadow-xl shadow-black/50"
          >
            <SpellCard spell={spell} compact />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Text with every mention of the given spells turned into a SpellMention. */
export function SpellText({ text, spells }: { text: string; spells: readonly Spell[] }) {
  return (
    <>
      {splitSpellMentions(text, spells).map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <SpellMention key={i} spell={p.spell}>
            {p.text}
          </SpellMention>
        ),
      )}
    </>
  );
}
