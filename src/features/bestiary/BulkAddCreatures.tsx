import { useLiveQuery } from 'dexie-react-hooks';
import { db, saveCreature } from '../../db';
import { parseCreatureText, suggestedSpells, validateCreature } from '../../logic';
import { BulkAdd } from '../bulk/BulkAdd';
import { CreatureForm } from './CreatureForm';
import { StatBlock } from './StatBlock';

const PLACEHOLDER = `Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 15 (leather armor, shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (−1) 14 (+2) 10 (+0) 10 (+0) 8 (−1) 8 (−1)
…`;

export function BulkAddCreatures() {
  const creatures = useLiveQuery(() => db.creatures.toArray());
  const spells = useLiveQuery(() => db.spells.toArray());
  return (
    <BulkAdd
      title="Bulk add stat blocks"
      noun="stat block"
      nounPlural="stat blocks"
      backTo="/bestiary"
      backLabel="Bestiary"
      placeholder={PLACEHOLDER}
      parse={(text) => {
        const parsed = parseCreatureText(text);
        // Link the spells its text names, as the editor would suggest.
        const found = suggestedSpells(parsed.value, spells ?? []);
        return found.length ? { ...parsed, value: { ...parsed.value, spellIds: found.map((s) => s.id) } } : parsed;
      }}
      validate={validateCreature}
      save={(t) => saveCreature(t)}
      viewPath={(t) => `/bestiary/${t.id}`}
      existingNames={(creatures ?? []).map((c) => c.name)}
      form={(t, onChange) => <CreatureForm value={t} onChange={onChange} />}
      preview={(t) => <StatBlock creature={{ ...t, name: t.name || 'Unnamed creature' }} />}
    />
  );
}
