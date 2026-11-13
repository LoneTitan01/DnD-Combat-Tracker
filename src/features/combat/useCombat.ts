import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, saveCombat } from '../../db';
import type { Combat, CreatureTemplate, ID } from '../../models';

export type UpdateCombat = (fn: (c: Combat) => Combat) => void;

/**
 * Loads a combat once and keeps it in memory; every change goes through `update`, which applies a
 * pure function from `src/logic` and autosaves the result, so the tab can be closed and the combat
 * resumed later. A write takes a few milliseconds; `saving` is true until every write has landed.
 * `undefined` = loading, `null` = not found.
 */
export function useCombat(id: ID): [Combat | null | undefined, UpdateCombat, boolean] {
  const [combat, setCombat] = useState<Combat | null | undefined>(undefined);
  const latest = useRef<Combat | null>(null);
  // Writes in flight, so the header can say "Saving…" until IndexedDB has everything.
  const pending = useRef(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCombat(undefined);
    db.combats.get(id).then((c) => {
      if (cancelled) return;
      latest.current = c ?? null;
      setCombat(c ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const update = useCallback<UpdateCombat>((fn) => {
    const cur = latest.current;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    latest.current = next;
    setCombat(next);
    pending.current += 1;
    setSaving(true);
    void saveCombat(next).finally(() => {
      pending.current -= 1;
      if (pending.current === 0) setSaving(false);
    });
  }, []);

  return [combat, update, saving];
}

/** Every stat block, by id. Combatants keep their own HP/XP, so this is only for names, stat blocks and recharge rules. */
export function useTemplates(): ReadonlyMap<ID, CreatureTemplate> {
  const creatures = useLiveQuery(() => db.creatures.toArray());
  return useMemo(() => new Map((creatures ?? []).map((c) => [c.id, c])), [creatures]);
}
