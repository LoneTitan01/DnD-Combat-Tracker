import { useEffect, useRef } from 'react';
import { tableView, type TableView } from '../../logic';
import type { Combat, ID } from '../../models';

/**
 * DM window ⇄ player-facing page, same computer, no backend. The DM window publishes a
 * pre-computed TableView, so the player page never receives HP, stats or recharge state.
 */
export const TABLE_CHANNEL = 'dm-combat-tracker:table';

export type TableMessage = { type: 'view'; combatId: ID; view: TableView } | { type: 'hello' };

export function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TABLE_CHANNEL);
}

/** Opens (or focuses) the player-facing window for a combat. */
export function openTableWindow(combatId: ID): void {
  window.open(`#/table?combat=${encodeURIComponent(combatId)}`, 'dm-combat-table');
}

/**
 * For the DM combat screen: publishes the table view whenever the combat changes,
 * and answers a freshly opened player page that says hello.
 */
export function useTablePublisher(combat: Combat | null | undefined): void {
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef(combat);
  latest.current = combat;

  useEffect(() => {
    const ch = openChannel();
    channel.current = ch;
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<TableMessage>) => {
      const c = latest.current;
      if (e.data?.type === 'hello' && c) ch.postMessage({ type: 'view', combatId: c.id, view: tableView(c) });
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    if (combat) channel.current?.postMessage({ type: 'view', combatId: combat.id, view: tableView(combat) });
  }, [combat]);
}
