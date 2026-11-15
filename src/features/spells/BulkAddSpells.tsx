import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveSpell } from '../../db';
import { parseSpellText, validateSpell } from '../../logic';
import { BulkAdd } from '../bulk/BulkAdd';
import { SpellCard } from './SpellCard';
import { SpellForm } from './SpellForm';

const PLACEHOLDER = `Fireball
3rd-level evocation
Casting Time: 1 action
Range: 150 feet
Components: V, S, M (a tiny ball of bat guano and sulfur)
Duration: Instantaneous
A bright streak flashes from your pointing finger…`;

export function BulkAddSpells() {
  const spells = useLiveQuery(() => db.spells.toArray());
  return (
    <BulkAdd
      title="Bulk add spells"
      noun="spell"
      nounPlural="spells"
      backTo="/spells"
      backLabel="Spells"
      placeholder={PLACEHOLDER}
      parse={parseSpellText}
      validate={validateSpell}
      save={(s) => saveSpell(s)}
      viewPath={(s) => `/spells/${s.id}`}
      existingNames={(spells ?? []).map((s) => s.name)}
      form={(s, onChange) => <SpellForm value={s} onChange={onChange} />}
      preview={(s) => (
        <article className="rounded-lg border border-sky-900/60 bg-stone-900 p-5 shadow-lg">
          <SpellCard spell={{ ...s, name: s.name || 'Unnamed spell' }} />
        </article>
      )}
      gridClass="lg:grid-cols-[minmax(0,1fr)_380px]"
    />
  );
}
