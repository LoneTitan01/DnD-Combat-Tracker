import type { ReactNode } from 'react';
import { HoverCard } from '../../components/HoverCard';
import { splitSpellMentions } from '../../logic';
import type { Spell } from '../../models';
import { SpellCard } from './SpellCard';

/**
 * A spell name that shows the spell's description on hover or keyboard focus. Clicking (or tapping,
 * on touch screens) pins it open until clicking elsewhere or pressing Escape.
 */
export function SpellMention({ spell, children }: { spell: Spell; children?: ReactNode }) {
  return (
    <HoverCard
      card={<SpellCard spell={spell} compact />}
      triggerClassName="text-sky-300 decoration-sky-500/60 hover:text-sky-200 focus-visible:ring-sky-400"
      cardClassName="border-sky-800/70"
    >
      {children ?? spell.name}
    </HoverCard>
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
