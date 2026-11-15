import type { ReactNode } from 'react';
import { ACTION_KIND_LABELS, abilityMod, formatHitDice, formatMod, rechargeLabel } from '../../logic';
import { ABILITIES, ACTION_KINDS, defenseLabel, type CreatureTemplate } from '../../models';

function Line({ label, children }: { label: string; children: ReactNode }) {
  if (children === '' || children === null || children === undefined) return null;
  return (
    <p>
      <span className="font-semibold text-amber-200">{label}</span> {children}
    </p>
  );
}

function Rule() {
  return <hr className="my-3 border-t-2 border-amber-700/60" />;
}

function Entry({ name, suffix, description }: { name: string; suffix?: string; description: string }) {
  return (
    <p className="mb-2 whitespace-pre-line">
      <span className="font-semibold italic text-stone-100">
        {name}
        {suffix && <span className="not-italic text-amber-300"> ({suffix})</span>}.
      </span>{' '}
      {description}
    </p>
  );
}

const list = (xs: readonly string[]) => xs.join(', ');

/** A printed-style 5e stat block. Read-only. */
export function StatBlock({ creature: t }: { creature: CreatureTemplate }) {
  return (
    <article className="rounded-lg border border-amber-800/60 bg-stone-900 p-5 text-sm leading-relaxed text-stone-300 shadow-lg">
      <header>
        <h2 className="font-display text-2xl font-bold text-amber-300">{t.name}</h2>
        <p className="italic text-stone-400">
          {t.size} {t.type}
          {t.alignment && `, ${t.alignment}`}
        </p>
      </header>
      <Rule />
      <Line label="Armor Class">
        {t.ac}
        {t.acNote && ` (${t.acNote})`}
      </Line>
      <Line label="Hit Points">
        {t.maxHP} ({formatHitDice(t.hitDice)})
      </Line>
      <Line label="Speed">{t.speed}</Line>
      <Rule />
      <div className="grid grid-cols-6 text-center">
        {ABILITIES.map((a) => (
          <div key={a}>
            <div className="text-xs font-bold uppercase text-amber-200">{a}</div>
            <div className="tabular-nums">
              {t.abilities[a]} ({formatMod(abilityMod(t.abilities[a]))})
            </div>
          </div>
        ))}
      </div>
      <Rule />
      <Line label="Saving Throws">{t.saves}</Line>
      <Line label="Skills">{t.skills}</Line>
      <Line label="Damage Vulnerabilities">{list(t.damageVulnerabilities)}</Line>
      <Line label="Damage Resistances">{list(t.damageResistances.map(defenseLabel))}</Line>
      <Line label="Damage Immunities">{list(t.damageImmunities.map(defenseLabel))}</Line>
      <Line label="Condition Immunities">{list(t.conditionImmunities)}</Line>
      <Line label="Senses">{t.senses}</Line>
      <Line label="Languages">{t.languages}</Line>
      <Line label="Challenge">
        {t.cr} ({t.xp.toLocaleString()} XP)
      </Line>

      {t.traits.length > 0 && (
        <>
          <Rule />
          {t.traits.map((tr) => (
            <Entry key={tr.id} name={tr.name} description={tr.description} />
          ))}
        </>
      )}

      {ACTION_KINDS.map((kind) => {
        const actions = t.actions.filter((a) => a.kind === kind);
        if (actions.length === 0) return null;
        return (
          <section key={kind}>
            <h3 className="mt-4 mb-2 border-b border-amber-700/60 font-display text-lg text-amber-300">
              {ACTION_KIND_LABELS[kind]}
            </h3>
            {actions.map((a) => (
              <Entry
                key={a.id}
                name={a.name}
                suffix={a.recharge ? rechargeLabel(a.recharge) : undefined}
                description={a.description}
              />
            ))}
          </section>
        );
      })}

      {t.notes && (
        <>
          <Rule />
          <p className="whitespace-pre-line text-stone-400">
            <span className="font-semibold text-stone-300">Notes.</span> {t.notes}
          </p>
        </>
      )}
    </article>
  );
}
