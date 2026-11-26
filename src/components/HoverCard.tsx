import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const WIDTH = 340;
const GAP = 6;
const MARGIN = 8;

interface Place {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/** Where the card goes: under the trigger if it fits (or has more room there), otherwise above. */
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
 * Inline text that shows a card on hover or keyboard focus. Clicking (or tapping, on touch screens)
 * pins it open until clicking elsewhere or pressing Escape.
 */
export function HoverCard({
  children,
  card,
  triggerClassName,
  cardClassName,
}: {
  children: ReactNode;
  card: ReactNode;
  triggerClassName: string;
  cardClassName: string;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
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
      if (!anchor.current?.contains(t) && !cardRef.current?.contains(t)) setPinned(false);
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
        className={`cursor-help rounded-sm underline decoration-dotted underline-offset-2 focus:outline-none focus-visible:ring-1 ${triggerClassName}`}
      >
        {children}
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={cardRef}
            id={id}
            role="tooltip"
            onMouseEnter={enter}
            onMouseLeave={leave}
            style={{ left: place.left, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, width: Math.min(WIDTH, window.innerWidth - 2 * MARGIN) }}
            className={`fixed z-50 overflow-y-auto rounded-lg border bg-stone-900 p-3 text-left shadow-xl shadow-black/50 ${cardClassName}`}
          >
            {card}
          </div>,
          document.body,
        )}
    </>
  );
}
