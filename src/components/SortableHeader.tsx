import { ArrowDownIcon, ArrowUpIcon } from './icons';

interface Props<K extends string> {
  column: K;
  label: string;
  /** The column the table is currently sorted by. */
  sort: K;
  desc: boolean;
  /** Called with the column clicked; the caller decides the new direction. */
  onSort: (column: K) => void;
  align?: 'left' | 'right';
  className?: string;
}

/**
 * A table header cell that sorts the table when clicked. The active column shows an arrow for its
 * direction (up = ascending, down = descending); other columns show a faint arrow on hover.
 */
export function SortableHeader<K extends string>({ column, label, sort, desc, onSort, align = 'left', className = '' }: Props<K>) {
  const active = sort === column;
  const Arrow = active && desc ? ArrowDownIcon : ArrowUpIcon;
  return (
    <th
      aria-sort={active ? (desc ? 'descending' : 'ascending') : 'none'}
      className={`py-2 font-medium ${align === 'right' ? 'text-right' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={active ? `Sorted ${desc ? 'descending' : 'ascending'} — click to reverse` : `Sort by ${label.toLowerCase()}`}
        className={`group inline-flex items-center gap-1 uppercase tracking-wider hover:text-stone-200 ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-amber-300' : ''}`}
      >
        {label}
        <Arrow className={`h-3.5 w-3.5 shrink-0 ${active ? '' : 'opacity-0 group-hover:opacity-40 group-focus-visible:opacity-40'}`} />
      </button>
    </th>
  );
}

/** Next sort state after clicking `column`: the same column flips direction, a new one starts ascending. */
export function nextSort<K extends string>(current: { sort: K; desc: boolean }, column: K): { sort: K; desc: boolean } {
  return current.sort === column ? { sort: column, desc: !current.desc } : { sort: column, desc: false };
}
