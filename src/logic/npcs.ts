import type { ID, Location, Npc } from '../models';
import { ancestorsOf, locationTree } from './locations';

const key = (name: string) => name.trim().toLowerCase();

/** A location's name with the places it's inside, e.g. "Leilon › Aubrey's Shoppe". Blank for no location. */
export function placeLabel(locations: readonly Location[], id: ID | undefined): string {
  const loc = id ? locations.find((l) => l.id === id) : undefined;
  if (!loc) return '';
  return [...ancestorsOf(locations, loc), loc].map((l) => l.name).join(' › ');
}

/** Every location in outline order, labelled with where it is, for picking where an NPC lives. */
export function placeOptions(locations: readonly Location[]): { id: ID; label: string }[] {
  return locationTree(locations).map(({ location }) => ({ id: location.id, label: placeLabel(locations, location.id) }));
}

/** NPCs living at a location, by name. */
export function npcsAt<T extends Pick<Npc, 'name' | 'locationId'>>(npcs: readonly T[], locationId: ID): T[] {
  return npcs.filter((n) => n.locationId === locationId).sort((a, b) => a.name.localeCompare(b.name));
}

/** The NPC with this name (ignoring case and spaces), if any. */
export function findNpcByName<T extends Pick<Npc, 'name'>>(npcs: readonly T[], name: string): T | undefined {
  const k = key(name);
  return k ? npcs.find((n) => key(n.name) === k) : undefined;
}

/** NPCs whose name, location (including the places it's inside) or notes contain the search text, ignoring case. */
export function filterNpcs<T extends Pick<Npc, 'name' | 'locationId' | 'notes'>>(npcs: readonly T[], query: string, locations: readonly Location[]): T[] {
  const q = key(query);
  if (!q) return [...npcs];
  return npcs.filter(
    (n) =>
      n.name.toLowerCase().includes(q) ||
      placeLabel(locations, n.locationId).toLowerCase().includes(q) ||
      (n.notes ?? '').toLowerCase().includes(q),
  );
}

/**
 * NPC records for the names locations used to list (before NPCs had their own table). One NPC per
 * name per campaign, living at the most deeply nested place that listed them (the shop over its
 * town). Ids come from the campaign and name, and the stamp is 0, so devices that upgrade
 * separately make the same records, and any real edit wins over them in sync.
 */
export function npcsFromLegacyLocations(locations: readonly (Location & { npcs?: unknown })[]): Npc[] {
  const found = new Map<string, { npc: Npc; depth: number }>();
  for (const loc of locations) {
    if (!Array.isArray(loc.npcs)) continue;
    const depth = ancestorsOf(locations, loc).length;
    for (const raw of loc.npcs) {
      if (typeof raw !== 'string' || !key(raw)) continue;
      const id = `npc:${loc.campaignId}:${key(raw)}`;
      const prev = found.get(id);
      if (prev && (prev.depth > depth || (prev.depth === depth && prev.npc.locationId! < loc.id))) continue;
      found.set(id, { npc: { id, campaignId: loc.campaignId, name: raw.trim(), locationId: loc.id, updatedAt: 0 }, depth });
    }
  }
  return [...found.values()].map((f) => f.npc);
}
