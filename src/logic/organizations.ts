import type { ID, Npc, Organization } from '../models';
import { newId } from './ids';

const key = (name: string) => name.trim().toLowerCase();

export function blankOrganization(campaignId: ID, name = ''): Organization {
  const now = Date.now();
  return { id: newId(), campaignId, name, description: '', createdAt: now, updatedAt: now };
}

/** An organization's members, by name. */
export function membersOf<T extends Pick<Npc, 'name' | 'organizationIds'>>(npcs: readonly T[], organizationId: ID): T[] {
  return npcs.filter((n) => n.organizationIds?.includes(organizationId)).sort((a, b) => a.name.localeCompare(b.name));
}

/** The organizations an NPC belongs to, by name. Ids of deleted organizations are skipped. */
export function organizationsOf<T extends Pick<Organization, 'id' | 'name'>>(organizations: readonly T[], npc: Pick<Npc, 'organizationIds'>): T[] {
  const ids = new Set(npc.organizationIds ?? []);
  return organizations.filter((o) => ids.has(o.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/** The organization with this name (ignoring case and spaces), if any. */
export function findOrganizationByName<T extends Pick<Organization, 'name'>>(organizations: readonly T[], name: string): T | undefined {
  const k = key(name);
  return k ? organizations.find((o) => key(o.name) === k) : undefined;
}

/** Organizations whose name, description or member names contain the search text, ignoring case. */
export function filterOrganizations<T extends Pick<Organization, 'id' | 'name' | 'description'>>(
  organizations: readonly T[],
  query: string,
  npcs: readonly Pick<Npc, 'name' | 'organizationIds'>[],
): T[] {
  const q = key(query);
  if (!q) return [...organizations];
  return organizations.filter(
    (o) =>
      o.name.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q) ||
      membersOf(npcs, o.id).some((n) => n.name.toLowerCase().includes(q)),
  );
}
