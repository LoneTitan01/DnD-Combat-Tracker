import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card, PageHeader } from '../../components/ui';
import type { Combat, CreatureTemplate, ID } from '../../models';
import { openTableWindow, useTablePublisher } from '../table/tableChannel';
import { CombatLog, XPTally } from './CombatLog';
import { StagingView } from './StagingView';
import { confirmAndDeleteCombat } from './stage';
import { TrackerView } from './TrackerView';
import { useCombat, useTemplates, type UpdateCombat } from './useCombat';

const STATUS_LABEL: Record<Combat['status'], string> = {
  staged: 'Ready to run',
  active: 'In progress',
  ended: 'Ended',
};

function RecapView({
  combat,
  templates,
  update,
}: {
  combat: Combat;
  templates: ReadonlyMap<ID, CreatureTemplate>;
  update: UpdateCombat;
}) {
  const defeated = combat.combatants.filter((c) => c.kind === 'creature' && c.isDead);
  const standing = combat.combatants.filter((c) => c.kind === 'creature' && !c.isDead);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone-400">
        Ended in round {combat.round}.{' '}
        <button type="button" className="text-amber-400 hover:underline" onClick={() => update((c) => ({ ...c, status: 'active' }))}>
          Reopen
        </button>{' '}
        if it ended by mistake.
      </p>
      <XPTally combat={combat} />
      <Card className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Defeated</h2>
          <ul className="text-sm text-stone-300">
            {defeated.map((c) => (
              <li key={c.id}>
                {c.tokenName} <span className="text-stone-500">· {c.xp.toLocaleString()} XP</span>
              </li>
            ))}
            {defeated.length === 0 && <li className="text-stone-500">None</li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Still standing</h2>
          <ul className="text-sm text-stone-300">
            {standing.map((c) => (
              <li key={c.id}>
                {c.tokenName} <span className="text-stone-500">· {c.currentHP}/{c.maxHP} HP</span>
              </li>
            ))}
            {standing.length === 0 && <li className="text-stone-500">None</li>}
          </ul>
        </div>
      </Card>
      <CombatLog combat={combat} templates={templates} readOnly />
    </div>
  );
}

export function CombatPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [combat, update, saving] = useCombat(id);
  const templates = useTemplates();
  useTablePublisher(combat);

  if (combat === undefined) return null;
  if (combat === null) {
    return (
      <p className="text-stone-400">
        That combat doesn't exist.{' '}
        <Link to="/combats" className="text-amber-400 hover:underline">
          Back to combats
        </Link>
      </p>
    );
  }

  return (
    <>
      <PageHeader title={combat.name || 'Untitled combat'}>
        <span className="self-center text-xs text-stone-500" role="status" aria-label="Save status">
          {saving ? 'Saving…' : 'All changes saved'}
        </span>
        <span className="self-center rounded-full border border-stone-700 px-2 py-0.5 text-xs text-stone-400">
          {STATUS_LABEL[combat.status]}
        </span>
        <Button onClick={() => openTableWindow(combat.id)} title="Open the player-facing screen in a new window">
          Player view ↗
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            if (await confirmAndDeleteCombat(combat)) navigate('/combats', { replace: true });
          }}
        >
          Delete
        </Button>
      </PageHeader>
      {combat.status === 'staged' && <StagingView combat={combat} update={update} templates={templates} />}
      {combat.status === 'active' && <TrackerView combat={combat} update={update} templates={templates} />}
      {combat.status === 'ended' && <RecapView combat={combat} templates={templates} update={update} />}
    </>
  );
}
