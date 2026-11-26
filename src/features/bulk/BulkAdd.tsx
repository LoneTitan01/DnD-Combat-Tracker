import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, Card, PageHeader, TextArea } from '../../components/ui';
import { useShortcuts } from '../../components/shortcuts';
import { useHotkeys } from '../settings/hotkeys';
import { newId, type Parsed } from '../../logic';

type Status = 'pending' | 'approved' | 'discarded';

interface Item<T> {
  key: string;
  /** The pasted text it was read from, editable so it can be read again. */
  source: string;
  value: T;
  warnings: string[];
  status: Status;
  /** Show validation errors (after a failed approve). */
  showErrors: boolean;
}

interface Paste {
  key: string;
  text: string;
}

const emptyPaste = (): Paste => ({ key: newId(), text: '' });

/** Always one empty box at the end, so there's somewhere to paste the next one. */
function withTrailingEmpty(list: Paste[]): Paste[] {
  const trimmed = [...list];
  while (trimmed.length > 1 && !trimmed[trimmed.length - 1]!.text.trim() && !trimmed[trimmed.length - 2]!.text.trim()) trimmed.pop();
  return trimmed.length && !trimmed[trimmed.length - 1]!.text.trim() ? trimmed : [...trimmed, emptyPaste()];
}

export interface BulkAddProps<T extends { id: string; name: string }> {
  title: string;
  /** "stat block" / "spell". */
  noun: string;
  nounPlural: string;
  /** The list page to go back to. */
  backTo: string;
  backLabel: string;
  placeholder: string;
  parse: (text: string) => Parsed<T>;
  validate: (value: T) => string[];
  save: (value: T) => Promise<void>;
  /** Where an approved one can be opened. */
  viewPath: (value: T) => string;
  /** Names already in the list, to warn about duplicates. */
  existingNames: readonly string[];
  form: (value: T, onChange: (value: T) => void) => ReactNode;
  preview: (value: T) => ReactNode;
  /** Literal Tailwind grid class for the form + preview columns (so Tailwind sees it). */
  gridClass?: string;
}

/**
 * Bulk add: paste many stat blocks (or spells) into separate boxes, have them read, then review
 * each in an editable carousel and approve them one at a time or all at once.
 */
export function BulkAdd<T extends { id: string; name: string }>(props: BulkAddProps<T>) {
  const { noun, nounPlural, parse, validate, save, existingNames } = props;
  const [phase, setPhase] = useState<'paste' | 'review'>('paste');
  const [pastes, setPastes] = useState<Paste[]>(() => [emptyPaste()]);
  const [items, setItems] = useState<Item<T>[]>([]);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const filled = pastes.filter((p) => p.text.trim());
  const pending = items.filter((i) => i.status === 'pending');
  const unsaved = pending.length > 0 || filled.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const plural = (n: number) => `${n} ${n === 1 ? noun : nounPlural}`;
  const current = items[index];
  const go = (i: number) => {
    if (items.length === 0) return;
    setIndex((i + items.length) % items.length);
  };
  const hotkeys = useHotkeys();
  useShortcuts(phase === 'review' ? { [hotkeys.bulkPrev]: () => go(index - 1), [hotkeys.bulkNext]: () => go(index + 1) } : {});

  const update = (key: string, patch: Partial<Item<T>>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const readAll = () => {
    const fresh: Item<T>[] = filled.map((p) => {
      const { value, warnings } = parse(p.text);
      return { key: newId(), source: p.text, value, warnings, status: 'pending', showErrors: false };
    });
    if (fresh.length === 0) return;
    setIndex(items.length);
    setItems([...items, ...fresh]);
    setPastes([emptyPaste()]);
    setMessage(null);
    setPhase('review');
  };

  /** The next pending item after `from`, wrapping around; -1 when none are left. */
  const nextPending = (list: Item<T>[], from: number) => {
    for (let step = 1; step <= list.length; step++) {
      const j = (from + step) % list.length;
      if (list[j]!.status === 'pending') return j;
    }
    return -1;
  };

  const approve = async (item: Item<T>) => {
    if (validate(item.value).length) {
      update(item.key, { showErrors: true });
      return;
    }
    setBusy(true);
    try {
      await save({ ...item.value, name: item.value.name.trim() });
      const list = items.map((i) => (i.key === item.key ? { ...i, status: 'approved' as const } : i));
      setItems(list);
      setMessage({ text: `Added ${item.value.name.trim()}.` });
      const next = nextPending(list, index);
      if (next >= 0) setIndex(next);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Saving failed.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const approveAll = async () => {
    setBusy(true);
    let saved = 0;
    const list = [...items];
    try {
      for (let i = 0; i < list.length; i++) {
        const item = list[i]!;
        if (item.status !== 'pending') continue;
        if (validate(item.value).length) {
          list[i] = { ...item, showErrors: true };
          continue;
        }
        await save({ ...item.value, name: item.value.name.trim() });
        list[i] = { ...item, status: 'approved' };
        saved++;
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Saving failed.', error: true });
    } finally {
      setItems(list);
      setBusy(false);
    }
    const stuck = list.filter((i) => i.status === 'pending');
    if (stuck.length) {
      setIndex(list.indexOf(stuck[0]!));
      setMessage({
        text: `Added ${plural(saved)}. ${plural(stuck.length)} still ${stuck.length === 1 ? 'needs' : 'need'} fixing before ${stuck.length === 1 ? 'it' : 'they'} can be added.`,
        error: true,
      });
    } else {
      setMessage({ text: `Added ${plural(saved)}.` });
    }
  };

  const banner = message && (
    <div
      role="status"
      className={`mb-4 flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
        message.error ? 'border-amber-800 bg-amber-950/40 text-amber-200' : 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
      }`}
    >
      {message.text}
      <button type="button" className="ml-3 text-xs opacity-70 hover:opacity-100" onClick={() => setMessage(null)}>
        Dismiss
      </button>
    </div>
  );

  // ---------- paste ----------
  if (phase === 'paste') {
    return (
      <>
        <PageHeader title={props.title}>
          <Link to={props.backTo} className="self-center text-sm text-stone-400 hover:text-stone-100">
            ← {props.backLabel}
          </Link>
        </PageHeader>
        {banner}
        <p className="mb-4 max-w-3xl text-sm text-stone-400">
          Paste one {noun} per box, copied from a PDF, a website or your own notes. Each is read as well as it can be,
          then you can check and fix every one before adding it.
        </p>
        {pending.length > 0 && (
          <p className="mb-4 text-sm text-stone-400">
            {plural(pending.length)} still waiting for review.{' '}
            <button type="button" className="text-amber-400 hover:underline" onClick={() => setPhase('review')}>
              Back to review
            </button>
          </p>
        )}
        <div className="flex flex-col gap-4 pb-24">
          {pastes.map((p, i) => (
            <Card key={p.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor={`paste-${p.key}`} className="text-xs uppercase tracking-wider text-stone-500">
                  {noun.charAt(0).toUpperCase() + noun.slice(1)} {i + 1}
                </label>
                {(p.text || pastes.length > 1) && (
                  <Button
                    variant="ghost"
                    aria-label={`Remove ${noun} ${i + 1}`}
                    onClick={() => setPastes(withTrailingEmpty(pastes.filter((x) => x.key !== p.key)))}
                  >
                    ✕
                  </Button>
                )}
              </div>
              <TextArea
                id={`paste-${p.key}`}
                rows={p.text ? 12 : 4}
                value={p.text}
                placeholder={props.placeholder}
                onChange={(e) =>
                  setPastes(withTrailingEmpty(pastes.map((x) => (x.key === p.key ? { ...x, text: e.target.value } : x))))
                }
                className="font-mono text-xs leading-relaxed"
              />
            </Card>
          ))}
        </div>
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3 px-4 py-3">
            <span className="mr-auto text-xs text-stone-500">{filled.length ? `${plural(filled.length)} pasted` : 'Nothing pasted yet'}</span>
            <Button variant="primary" disabled={!filled.length} onClick={readAll}>
              Read {filled.length > 1 ? plural(filled.length) : filled.length ? `${noun}` : nounPlural}
            </Button>
          </div>
        </div>
      </>
    );
  }

  // ---------- review ----------
  const approvedCount = items.filter((i) => i.status === 'approved').length;
  const discardedCount = items.filter((i) => i.status === 'discarded').length;
  const errors = current ? validate(current.value) : [];
  const duplicate =
    current?.status === 'pending' &&
    existingNames.some((n) => n.trim().toLowerCase() === current.value.name.trim().toLowerCase());

  return (
    <>
      <PageHeader title={props.title}>
        <Button onClick={() => setPhase('paste')}>+ Paste more</Button>
        <Link to={props.backTo} className="self-center text-sm text-stone-400 hover:text-stone-100">
          ← {props.backLabel}
        </Link>
      </PageHeader>
      {banner}

      {pending.length === 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 text-sm text-stone-300">
          <span className="mr-auto">
            All reviewed: {plural(approvedCount)} added{discardedCount ? `, ${discardedCount} discarded` : ''}.
          </span>
          <Button onClick={() => setPhase('paste')}>Paste more</Button>
          <Link to={props.backTo} className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-stone-950 hover:bg-amber-400">
            {props.backLabel}
          </Link>
        </Card>
      )}

      <nav aria-label={`${nounPlural} to review`} className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {items.map((item, i) => {
          const bad = item.status === 'pending' && item.showErrors && validate(item.value).length > 0;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={i === index ? 'step' : undefined}
              onClick={() => setIndex(i)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                i === index ? 'border-amber-500 bg-amber-500/15 text-amber-100' : 'border-stone-700 text-stone-400 hover:border-stone-500'
              } ${item.status === 'discarded' ? 'line-through opacity-50' : ''}`}
            >
              <span aria-hidden className={item.status === 'approved' ? 'text-emerald-400' : bad ? 'text-red-400' : 'text-stone-500'}>
                {item.status === 'approved' ? '✓' : item.status === 'discarded' ? '✕' : bad ? '!' : item.warnings.length ? '?' : '•'}
              </span>
              <span className="max-w-40 truncate">{item.value.name || `Unnamed ${noun}`}</span>
              <span className="sr-only">
                {item.status === 'pending' ? (bad ? '(needs fixing)' : '(to review)') : `(${item.status})`}
              </span>
            </button>
          );
        })}
      </nav>

      {current && (
        <div key={current.key} className={`grid gap-6 pb-24 ${props.gridClass ?? 'lg:grid-cols-[minmax(0,1fr)_400px]'}`}>
          <section aria-label={`${noun} ${index + 1} of ${items.length}`} className="flex min-w-0 flex-col gap-4">
            {current.status === 'approved' && (
              <Card className="border-emerald-800 bg-emerald-950/30 text-sm text-emerald-200">
                Added to the list.{' '}
                <Link to={props.viewPath(current.value)} className="underline hover:text-emerald-100">
                  Open {current.value.name}
                </Link>
              </Card>
            )}
            {current.status === 'discarded' && (
              <Card className="flex items-center justify-between text-sm text-stone-400">
                Discarded; it won't be added.
                <Button onClick={() => update(current.key, { status: 'pending' })}>Restore</Button>
              </Card>
            )}
            {current.status === 'pending' && (current.warnings.length > 0 || duplicate) && (
              <Card className="border-amber-800/70 bg-amber-950/20">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-400">Check these</p>
                <ul className="list-disc pl-5 text-sm text-amber-100/90">
                  {duplicate && (
                    <li>
                      There's already a {noun} named {current.value.name.trim()}; approving adds another.
                    </li>
                  )}
                  {current.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Card>
            )}
            {current.status === 'pending' && (
              <>
                {props.form(current.value, (value) => update(current.key, { value }))}
                <SourceText
                  source={current.source}
                  onReread={(source) => {
                    const { value, warnings } = parse(source);
                    // Keep the id, so a re-read is still the same record.
                    update(current.key, { source, value: { ...value, id: current.value.id }, warnings, showErrors: false });
                  }}
                />
              </>
            )}
          </section>
          <aside className={current.status === 'pending' ? 'hidden lg:block' : ''}>
            <div className="sticky top-20 max-h-[calc(100dvh-10rem)] overflow-y-auto">
              <p className="mb-2 text-xs uppercase tracking-wider text-stone-500">Preview</p>
              {props.preview(current.value)}
            </div>
          </aside>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="text-lg leading-none" aria-label="Previous" disabled={items.length < 2} onClick={() => go(index - 1)}>
              ‹
            </Button>
            <span className="min-w-16 text-center text-xs tabular-nums text-stone-400">
              {index + 1} of {items.length}
            </span>
            <Button variant="ghost" className="text-lg leading-none" aria-label="Next" disabled={items.length < 2} onClick={() => go(index + 1)}>
              ›
            </Button>
          </div>
          {current?.status === 'pending' && current.showErrors && errors.length > 0 ? (
            <ul className="mr-auto text-xs text-red-400">
              {errors.slice(0, 3).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {errors.length > 3 && <li>…and {errors.length - 3} more</li>}
            </ul>
          ) : (
            <span className="mr-auto" />
          )}
          {current?.status === 'pending' && (
            <>
              <Button variant="ghost" onClick={() => update(current.key, { status: 'discarded' })}>
                Discard
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void approve(current)}>
                Approve
              </Button>
            </>
          )}
          <Button
            variant={current?.status === 'pending' ? 'secondary' : 'primary'}
            disabled={busy || pending.length === 0}
            onClick={() => void approveAll()}
          >
            Approve all ({pending.length})
          </Button>
        </div>
      </div>
    </>
  );
}

/** The pasted text, tucked away; edit it and read it again to start that one over. */
function SourceText({ source, onReread }: { source: string; onReread: (text: string) => void }) {
  const [text, setText] = useState(source);
  return (
    <details className="rounded-lg border border-stone-800 bg-stone-900/60 p-4 text-sm">
      <summary className="cursor-pointer text-stone-400">Pasted text</summary>
      <TextArea
        aria-label="Pasted text"
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-3 w-full font-mono text-xs leading-relaxed"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          disabled={!text.trim()}
          onClick={() => {
            if (confirm('Read the text again? Changes made in the form above will be replaced.')) onReread(text);
          }}
        >
          Read again
        </Button>
        <span className="text-xs text-stone-500">Replaces the form with what's read from this text.</span>
      </div>
    </details>
  );
}
