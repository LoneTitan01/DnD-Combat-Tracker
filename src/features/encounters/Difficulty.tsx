import type { Difficulty, EncounterStats } from '../../logic';

const STYLE: Record<Difficulty, string> = {
  trivial: 'border-stone-600 text-stone-300',
  easy: 'border-emerald-700 bg-emerald-950/50 text-emerald-300',
  medium: 'border-sky-700 bg-sky-950/50 text-sky-300',
  hard: 'border-amber-600 bg-amber-950/50 text-amber-300',
  deadly: 'border-red-700 bg-red-950/50 text-red-300',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty | null }) {
  if (!difficulty) return null;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${STYLE[difficulty]}`}>
      {difficulty}
    </span>
  );
}

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard', 'deadly'];

/** Totals plus the four party thresholds, with the one this encounter reaches highlighted. */
export function DifficultyPanel({ stats }: { stats: EncounterStats }) {
  const reached = stats.difficulty ? LEVELS.indexOf(stats.difficulty) : -1;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-stone-950/60 px-2 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-stone-500">Total XP</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.baseXP.toLocaleString()}</dd>
        </div>
        <div className="rounded-md bg-stone-950/60 px-2 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-stone-500">Multiplier</dt>
          <dd className="text-lg font-semibold tabular-nums">×{stats.multiplier}</dd>
        </div>
        <div className="rounded-md bg-stone-950/60 px-2 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-stone-500">Adjusted XP</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.adjustedXP.toLocaleString()}</dd>
        </div>
      </dl>
      {stats.difficulty ? (
        <>
          <p className="text-sm text-stone-300">
            Difficulty: <DifficultyBadge difficulty={stats.difficulty} />
          </p>
          <ol className="grid grid-cols-4 gap-1 text-center text-[11px]" aria-label="Party thresholds">
            {LEVELS.map((d, i) => (
              <li
                key={d}
                className={`rounded border px-1 py-1 ${i === reached ? STYLE[d] : 'border-stone-800 text-stone-500'}`}
              >
                <div className="capitalize">{d}</div>
                <div className="tabular-nums">{stats.thresholds[i]!.toLocaleString()}</div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-xs text-stone-500">Pick players with a level to see the difficulty.</p>
      )}
    </div>
  );
}
