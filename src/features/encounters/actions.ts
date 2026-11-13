import { db, deleteEncounter, saveEncounter } from '../../db';
import { duplicateEncounter } from '../../logic';
import type { Encounter, ID } from '../../models';

/** Duplicates the saved version of an encounter and returns the copy's id. */
export async function duplicateAndSaveEncounter(id: ID): Promise<ID> {
  const original = await db.encounters.get(id);
  if (!original) throw new Error('Encounter not found.');
  const names = (await db.encounters.toArray()).map((e) => e.name);
  const copy = duplicateEncounter(original, names);
  await saveEncounter(copy);
  return copy.id;
}

/** Staged and running combats keep their own copy of the creatures, so they're unaffected. */
export async function confirmAndDeleteEncounter(e: Pick<Encounter, 'id' | 'name'>): Promise<boolean> {
  if (!confirm(`Delete the encounter "${e.name || 'Untitled'}"? Combats already staged from it are kept.`)) return false;
  await deleteEncounter(e.id);
  return true;
}
