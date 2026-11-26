import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filters kept in the URL's search params, so they survive leaving the page and coming back.
 *
 * React Router's functional `setSearchParams` updater is handed the params from the last render,
 * so two updates in quick succession (e.g. "Clear" then picking a filter before React re-renders)
 * would rebuild from stale params and bring cleared filters back. We track the latest params in a
 * ref and always build the next value from it.
 */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  latest.current = params;

  const commit = useCallback(
    (next: URLSearchParams) => {
      latest.current = next;
      setParams(next, { replace: true });
    },
    [setParams],
  );

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(latest.current);
      if (value) next.set(key, value);
      else next.delete(key);
      commit(next);
    },
    [commit],
  );

  /** Clears every param except those named in `keep` (e.g. the sort order). */
  const clearFilters = useCallback(
    (keep: readonly string[] = []) => {
      const next = new URLSearchParams();
      for (const key of keep) {
        const value = latest.current.get(key);
        if (value) next.set(key, value);
      }
      commit(next);
    },
    [commit],
  );

  return { params, setFilter, clearFilters };
}
