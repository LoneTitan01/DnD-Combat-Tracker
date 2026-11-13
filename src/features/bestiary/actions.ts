import { db, deleteCreature, encountersUsingCreature, saveCreature } from '../../db';
import { duplicateCreature } from '../../logic';
import type { CreatureTemplate, ID } from '../../models';

/** Saves a copy for making variants and returns its id. */
export async function duplicateAndSave(t: CreatureTemplate): Promise<ID> {
  const names = (await db.creatures.toArray()).map((c) => c.name);
  const copy = duplicateCreature(t, names);
  await saveCreature(copy);
  return copy.id;
}

/** Confirms (warning about encounters that use it), then deletes. Returns whether it was deleted. */
export async function confirmAndDelete(t: CreatureTemplate): Promise<boolean> {
  const used = await encountersUsingCreature(t.id);
  const warning = used.length
    ? `\n\nIt's used in ${used.length} encounter${used.length === 1 ? '' : 's'} (${used
        .slice(0, 3)
        .map((e) => e.name)
        .join(', ')}${used.length > 3 ? '…' : ''}); it will be left out of them.`
    : '';
  if (!confirm(`Delete ${t.name}?${warning}`)) return false;
  await deleteCreature(t.id);
  return true;
}
