import { useEffect, useRef, useState } from 'react';
import { TextArea } from '../../components/ui';
import { setCombatantNotes } from '../../logic';
import type { Combatant } from '../../models';
import type { UpdateCombat } from './useCombat';

/**
 * DM-only notes for one combatant. Edits save shortly after typing stops, on blur, and when the
 * panel closes, so switching creatures never loses a note. Render with `key={combatant.id}`.
 */
export function CombatNotes({ combatant: c, update }: { combatant: Combatant; update: UpdateCombat }) {
  const [draft, setDraft] = useState(c.notes ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);

  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current === null) return;
    const text = pending.current;
    pending.current = null;
    update((cb) => setCombatantNotes(cb, c.id, text));
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`notes-${c.id}`} className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        Combat notes <span className="font-normal normal-case text-stone-500">(DM only)</span>
      </label>
      <TextArea
        id={`notes-${c.id}`}
        aria-label={`Combat notes for ${c.tokenName}`}
        placeholder="Tactics, who it's targeting, loot, anything to remember…"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          pending.current = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 500);
        }}
        onBlur={flush}
        className="text-sm"
      />
    </div>
  );
}
