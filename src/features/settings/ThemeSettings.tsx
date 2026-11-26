import { THEMES, setTheme, useTheme } from './theme';

/** The Theme section of the Settings page. Each option previews itself in its own colours. */
export function ThemeSettings() {
  const current = useTheme();
  return (
    <section aria-labelledby="settings-theme" className="flex flex-col gap-4">
      <h2 id="settings-theme" className="font-display text-xl font-semibold text-stone-100">
        Theme
      </h2>
      <div role="radiogroup" aria-labelledby="settings-theme" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {THEMES.map((t) => {
          const on = t.id === current;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-theme={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex flex-col gap-3 rounded-lg border-2 bg-stone-950 p-3 text-left transition-colors ${
                on ? 'border-amber-500' : 'border-stone-800 hover:border-stone-600'
              }`}
            >
              <span aria-hidden className="flex flex-col gap-1.5 rounded-md border border-stone-800 bg-stone-900 p-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-10 rounded-full bg-amber-400" />
                  <span className="h-2 w-6 rounded-full bg-stone-600" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-14 rounded-full bg-stone-400" />
                  <span className="h-2 w-4 rounded-full bg-red-400" />
                  <span className="h-2 w-4 rounded-full bg-emerald-400" />
                </span>
                <span className="mt-1 h-4 w-12 rounded bg-amber-500" />
              </span>
              <span>
                <span className="flex items-center justify-between font-semibold text-stone-100">
                  {t.name}
                  {on && <span className="text-xs font-normal text-amber-300">Current</span>}
                </span>
                <span className="block text-sm text-stone-400">{t.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-stone-500">Saved on this device only. The table screen always stays dark.</p>
    </section>
  );
}
