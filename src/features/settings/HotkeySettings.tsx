import { useEffect, useState } from 'react';
import { Button, Card } from '../../components/ui';
import {
  DEFAULT_HOTKEYS,
  HOTKEY_ACTIONS,
  conflictFor,
  isBindable,
  keyLabel,
  normalizeKey,
  resetHotkeys,
  saveHotkeys,
  useHotkeys,
  type HotkeyAction,
} from './hotkeys';

const labelOf = (id: HotkeyAction) => HOTKEY_ACTIONS.find((a) => a.id === id)!.label;
const SCOPES = [...new Set(HOTKEY_ACTIONS.map((a) => a.scope))];

export function Kbd({ k }: { k: string }) {
  return <kbd className="rounded border border-stone-700 bg-stone-950 px-1.5 py-0.5 font-mono text-xs text-stone-200">{keyLabel(k)}</kbd>;
}

/** The Keyboard shortcuts section of the Settings page. */
export function HotkeySettings() {
  const hotkeys = useHotkeys();
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // While recording, the next key press becomes the shortcut. Capture phase, so the page's own shortcuts don't fire.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || !isBindable(e.key)) {
        setNote(`${e.key === ' ' ? 'Space' : e.key} can’t be a shortcut. Press a single key, or Esc to cancel.`);
        return;
      }
      const key = normalizeKey(e.key);
      const clash = conflictFor(hotkeys, recording, key);
      const next = { ...hotkeys, [recording]: key };
      if (clash) next[clash] = hotkeys[recording];
      saveHotkeys(next);
      setNote(clash ? `${keyLabel(key)} was ${labelOf(clash)}; that’s now ${keyLabel(hotkeys[recording])}.` : null);
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, hotkeys]);

  const isDefault = HOTKEY_ACTIONS.every((a) => hotkeys[a.id] === a.default);

  return (
    <section aria-labelledby="settings-hotkeys" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="settings-hotkeys" className="font-display text-xl font-semibold text-stone-100">
          Keyboard shortcuts
        </h2>
        <Button
          disabled={isDefault}
          onClick={() => {
            resetHotkeys();
            setRecording(null);
            setNote(null);
          }}
        >
          Reset all to defaults
        </Button>
      </div>
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-stone-400">
          Click <span className="text-stone-200">Change</span>, then press the key you want. Shortcuts are single keys and
          are ignored while you’re typing in a box. They’re saved on this device only.
        </p>
        {note && (
          <p className="rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-sm text-amber-200" role="status">
            {note}
          </p>
        )}
        {SCOPES.map((scope) => (
          <div key={scope}>
            <h3 className="mb-1 text-sm font-semibold text-stone-300">{scope}</h3>
            <ul className="divide-y divide-stone-800">
              {HOTKEY_ACTIONS.filter((a) => a.scope === scope).map((a) => {
                const on = recording === a.id;
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="flex-1 text-stone-200">{a.label}</span>
                    <span aria-label={`Shortcut for ${a.label}`}>
                      <Kbd k={hotkeys[a.id]} />
                    </span>
                    <Button
                      className={`w-36 ${on ? 'border-amber-500! text-amber-200!' : ''}`}
                      aria-label={on ? `Press a key for ${a.label}` : `Change shortcut for ${a.label}`}
                      aria-pressed={on}
                      onClick={() => {
                        setNote(null);
                        setRecording(on ? null : a.id);
                      }}
                    >
                      {on ? 'Press a key…' : 'Change'}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Reset shortcut for ${a.label}`}
                      disabled={hotkeys[a.id] === DEFAULT_HOTKEYS[a.id]}
                      onClick={() => {
                        const clash = conflictFor(hotkeys, a.id, a.default);
                        const next = { ...hotkeys, [a.id]: a.default };
                        if (clash) next[clash] = hotkeys[a.id];
                        saveHotkeys(next);
                        setNote(null);
                      }}
                    >
                      Reset
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </Card>
    </section>
  );
}
