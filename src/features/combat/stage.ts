import { db, deleteCombat, saveCombat } from '../../db';
import { stageCombat } from '../../logic';
import type { Combat, ID } from '../../models';

/**
 * Turns a saved encounter into a staged combat (creatures only, average HP, no initiative yet) and
 * returns its id. One encounter can be staged any number of times.
 */
export async function stageEncounter(encounterId: ID): Promise<ID> {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) throw new Error('Encounter not found.');
  const templates = await db.creatures.bulkGet(encounter.entries.map((e) => e.templateId));
  const map = new Map(templates.filter((t) => !!t).map((t) => [t!.id, t!]));
  const combat = stageCombat(encounter, map);
  await saveCombat(combat);
  return combat.id;
}

export async function confirmAndDeleteCombat(c: Pick<Combat, 'id' | 'name' | 'status'>): Promise<boolean> {
  const what = c.status === 'active' ? 'this combat in progress' : c.status === 'staged' ? 'this staged combat' : 'this combat record';
  if (!confirm(`Delete ${what} (${c.name || 'Untitled'})?`)) return false;
  await deleteCombat(c.id);
  return true;
}
