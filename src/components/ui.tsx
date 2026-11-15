import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const FIELD =
  'rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none';

/** Labelled field wrapper. */
export function Field({
  label,
  hint,
  className = '',
  children,
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-stone-400 ${className}`}>
      <span>
        {label}
        {hint && <span className="ml-1.5 text-stone-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} className={`${FIELD} resize-y ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${FIELD} ${className}`} {...props} />;
}

/**
 * Integer input that lets you type freely (empty, "-") and commits only valid numbers.
 * Reverts to the last valid value on blur.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((t) => (Number(t) === value && t.trim() !== '' ? t : String(value)));
  }, [value]);
  const valid = (n: number) => Number.isInteger(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
  return (
    <input
      inputMode="numeric"
      className={`${FIELD} tabular-nums ${className}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && valid(n)) onChange(n);
      }}
      onBlur={() => setText(String(value))}
      onFocus={(e) => e.target.select()}
      {...props}
    />
  );
}

/** Toggle chip for multi-select sets (damage types, conditions). */
export function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors ${
        on
          ? 'border-amber-500 bg-amber-500/20 text-amber-200'
          : 'border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200'
      }`}
    >
      {children}
    </button>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-3xl font-bold text-stone-100">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'magic' | 'mundane';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-amber-500 text-stone-950 hover:bg-amber-400 font-semibold',
  secondary: 'bg-stone-800 text-stone-100 hover:bg-stone-700 border border-stone-700',
  danger: 'bg-red-900/60 text-red-100 hover:bg-red-800 border border-red-800',
  ghost: 'text-stone-400 hover:text-stone-100 hover:bg-stone-800',
  /** Damage from a magical source, when the target resists only nonmagical weapons. */
  magic: 'bg-purple-600 text-white hover:bg-purple-500 font-semibold',
  /** Damage from a nonmagical source, when the target resists only nonmagical weapons. */
  mundane: 'bg-orange-600 text-stone-950 hover:bg-orange-500 font-semibold',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function TextInput({ className = '', ...props }: ComponentProps<'input'>) {
  return (
    <input className={`${FIELD} ${className}`} {...props} />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-stone-800 bg-stone-900/60 p-4 ${className}`}>{children}</div>;
}

export function ComingSoon({ milestone, children }: { milestone: number; children: ReactNode }) {
  return (
    <Card className="border-dashed text-stone-400">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-500/80">Milestone {milestone}</p>
      <div className="mt-2 text-sm">{children}</div>
    </Card>
  );
}
