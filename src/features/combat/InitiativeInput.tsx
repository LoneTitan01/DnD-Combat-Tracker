import { useEffect, useState } from 'react';
import { TextInput } from '../../components/ui';

function parse(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  return /^[+-]?\d+$/.test(t) ? Number(t) : undefined;
}

/**
 * Initiative box that can be empty (not rolled yet). Commits on blur or Enter, so typing "1" on the
 * way to "17" doesn't reshuffle the turn order mid-keystroke.
 */
export function InitiativeInput({
  value,
  onCommit,
  label,
  className = '',
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const n = parse(text);
    if (n === undefined || n === value) setText(value === null ? '' : String(value));
    else onCommit(n);
  };
  return (
    <TextInput
      aria-label={label}
      inputMode="numeric"
      placeholder="–"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onFocus={(e) => e.target.select()}
      className={`w-14 text-center tabular-nums ${className}`}
    />
  );
}
