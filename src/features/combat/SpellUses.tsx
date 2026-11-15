import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import {
  REST_LABELS,
  changeSpellUses,
  limitedSpells,
  spellUsesSpent,
} from "../../logic";
import type { Combatant, CreatureTemplate, ID, Spell } from "../../models";
import { SpellMention } from "../spells/SpellMention";
import type { UpdateCombat } from "./useCombat";

/** The given spells from the spell list, by id. Empty while loading. */
export function useSpellMap(ids: readonly ID[]): ReadonlyMap<ID, Spell> {
  const unique = [...new Set(ids)].sort();
  const key = unique.join(",");
  const spells = useLiveQuery(
    async () =>
      unique.length
        ? (await db.spells.bulkGet(unique)).filter((s): s is Spell => !!s)
        : [],
    [key],
  );
  return new Map((spells ?? []).map((s) => [s.id, s]));
}

/** Every spell with a limit across these stat blocks, so the tracker can load them in one go. */
export function limitedSpellIds(templates: Iterable<CreatureTemplate>): ID[] {
  return [...templates].flatMap((t) =>
    Object.keys(t.spellUsage ?? {}).filter((id) => t.spellIds?.includes(id)),
  );
}

const REST_SHORT: Record<keyof typeof REST_LABELS, string> = {
  short: "SR",
  long: "LR",
};

/**
 * One chip per limited-use spell: uses left as pips, Cast to spend one, − to give one back
 * (a mis-click or a retcon). Hovering the name shows the spell. Shown above the stat block in the side panel.
 */
export function SpellUseChips({
  combatant,
  template,
  spells,
  update,
}: {
  combatant: Combatant;
  template: CreatureTemplate | undefined;
  spells: ReadonlyMap<ID, Spell>;
  update: UpdateCombat;
}) {
  if (!template?.spellUsage) return null;
  const limited = limitedSpells(template, [...spells.values()]);
  if (limited.length === 0) return null;

  return (
    <section
      aria-label="Spell uses"
      className="flex flex-col gap-2 rounded-lg border border-sky-900/60 bg-stone-900 p-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        Spell uses
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {limited.map(({ spell, usage }) => {
          const spent = Math.min(
            spellUsesSpent(combatant, spell.id),
            usage.uses,
          );
          const left = usage.uses - spent;
          const out = left === 0;
          const change = (delta: number) =>
            update((c) =>
              changeSpellUses(c, combatant.id, spell.id, delta, usage.uses),
            );
          return (
            <span
              key={spell.id}
              role="group"
              aria-label={`${spell.name}: ${left} of ${usage.uses} uses left per ${REST_LABELS[usage.per].toLowerCase()}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                out
                  ? "border-stone-700 bg-stone-900 text-stone-500"
                  : "border-sky-800/70 bg-sky-950/40 text-sky-100"
              }`}
            >
              <span className={`font-semibold ${out ? "line-through" : ""}`}>
                <SpellMention spell={spell} />
              </span>
              <span className="flex gap-0.5" aria-hidden>
                {Array.from({ length: usage.uses }, (_, i) => (
                  <span
                    key={i}
                    className={`inline-block h-2 w-2 rounded-full border ${
                      i < left
                        ? "border-sky-300 bg-sky-300"
                        : "border-stone-500 bg-transparent"
                    }`}
                  />
                ))}
              </span>
              <span className="tabular-nums" title={REST_LABELS[usage.per]}>
                {left}/{usage.uses} · {REST_SHORT[usage.per]}
              </span>
              <button
                type="button"
                aria-label={`Give back a use of ${spell.name}`}
                title="Give back a use (mistake or retcon)"
                disabled={spent === 0}
                className="ml-0.5 rounded bg-stone-700 px-1.5 hover:bg-stone-600 disabled:opacity-40 disabled:hover:bg-stone-700"
                onClick={() => change(-1)}
              >
                −
              </button>
              <button
                type="button"
                aria-label={`Cast ${spell.name}`}
                disabled={out || combatant.isDead}
                className="rounded bg-sky-700 px-1.5 font-semibold text-white hover:bg-sky-600 disabled:bg-stone-700 disabled:text-stone-400"
                onClick={() => change(1)}
              >
                Cast
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}
