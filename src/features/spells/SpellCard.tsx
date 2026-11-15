import type { ReactNode } from 'react';
import { spellSubtitle } from '../../logic';
import type { Spell } from '../../models';

function Line({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p>
      <span className="font-semibold text-amber-200">{label}:</span> {children}
    </p>
  );
}

/** Duration as printed, with "Concentration, up to" added when flagged but not already written. */
export function spellDuration(s: Spell): string {
  if (!s.concentration || /concentration/i.test(s.duration)) return s.duration;
  return s.duration ? `Concentration, up to ${s.duration.replace(/^up to /i, '')}` : 'Concentration';
}

/** A spell's full description, printed-style. Used on its own page and in stat block pop-ups. */
export function SpellCard({ spell: s, compact = false }: { spell: Spell; compact?: boolean }) {
  return (
    <div className={`leading-relaxed text-stone-300 ${compact ? 'text-xs' : 'text-sm'}`}>
      <h3 className={`font-display font-bold text-amber-300 ${compact ? 'text-base' : 'text-2xl'}`}>{s.name}</h3>
      <p className="mb-2 italic text-stone-400">{spellSubtitle(s)}</p>
      <Line label="Casting Time">{s.castingTime}</Line>
      <Line label="Range">{s.range}</Line>
      <Line label="Components">{s.components}</Line>
      <Line label="Duration">{spellDuration(s)}</Line>
      {s.description && <p className="mt-2 whitespace-pre-line">{s.description}</p>}
      {s.higherLevels && (
        <p className="mt-2 whitespace-pre-line">
          <span className="font-semibold italic text-stone-100">At Higher Levels.</span> {s.higherLevels}
        </p>
      )}
    </div>
  );
}
