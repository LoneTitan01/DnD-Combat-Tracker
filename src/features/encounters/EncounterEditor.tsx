import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button, Card, Field, NumberField, PageHeader, Select, TextArea, TextInput } from '../../components/ui';
import { db, moveEncounterCombats, saveEncounter } from '../../db';
import {
  MAX_COUNT,
  addToEncounter,
  allTags,
  blankEncounter,
  campaignOf,
  encounterStats,
  inCampaign,
  parseTags,
  setEntryCount,
} from '../../logic';
import type { Encounter, ID } from '../../models';
import { confirmAndDeleteEncounter, duplicateAndSaveEncounter } from './actions';
import { CreaturePicker } from '../bestiary/CreaturePicker';
import { useCampaign } from '../campaigns/useCampaign';
import { stageEncounter } from '../combat/stage';
import { DifficultyPanel } from './Difficulty';

export function EncounterEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { campaigns, campaign } = useCampaign();
  const creatures = useLiveQuery(() => db.creatures.toArray());
  const allPlayers = useLiveQuery(() => db.players.orderBy('name').toArray());
  const allEncounters = useLiveQuery(() => db.encounters.toArray());
  const templates = useMemo(() => new Map((creatures ?? []).map((c) => [c.id, c])), [creatures]);

  const [draft, setDraft] = useState<Encounter | null>(id ? null : blankEncounter);
  const [tagText, setTagText] = useState('');
  const [saved, setSaved] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // A brand-new encounter remounts on its first save (new → :id), so carry the notice across.
  const [justSaved, setJustSaved] = useState(() => !!(location.state as { saved?: boolean } | null)?.saved);
  // Which roster players to rate difficulty against. Preview only: encounters never store players.
  const [excluded, setExcluded] = useState<Set<ID>>(new Set());

  useEffect(() => {
    if (!id) {
      setSaved(JSON.stringify({ ...draft, tags: [] }));
      return;
    }
    db.encounters.get(id).then((e) => {
      if (!e) return setNotFound(true);
      setDraft(e);
      setTagText(e.tags.join(', '));
      setSaved(JSON.stringify(e));
    });
  }, [id]);

  // A new encounter goes into the current campaign; an existing one stays in its own unless moved.
  const campaignId = !draft ? undefined : id ? campaignOf(draft) : (draft.campaignId ?? campaign?.id);
  const players = useMemo(() => allPlayers?.filter(inCampaign(campaignId)), [allPlayers, campaignId]);
  const encounters = useMemo(() => allEncounters?.filter(inCampaign(campaignId)), [allEncounters, campaignId]);

  const current = draft ? { ...draft, tags: parseTags(tagText) } : null;
  const dirty = current !== null && saved !== '' && JSON.stringify(current) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (dirty) setJustSaved(false);
  }, [dirty]);

  const counted = (players ?? []).filter((p) => !excluded.has(p.id));
  const levels = counted.map((p) => p.level).filter((l): l is number => l !== undefined);
  const levelsKey = levels.join(',');
  const stats = useMemo(
    () => encounterStats(draft ?? { entries: [] }, templates, levelsKey ? levelsKey.split(',').map(Number) : []),
    [draft, templates, levelsKey],
  );
  const knownTags = useMemo(() => allTags(encounters ?? []), [encounters]);

  if (notFound) {
    return (
      <p className="text-stone-400">
        That encounter doesn't exist.{' '}
        <Link to="/encounters" className="text-amber-400 hover:underline">
          Back to encounters
        </Link>
      </p>
    );
  }
  if (!draft || !current) return null;

  const set = (patch: Partial<Encounter>) => setDraft({ ...draft, ...patch });
  const nameError = !draft.name.trim() ? 'Name is required.' : null;
  const currentTagKeys = new Set(current.tags.map((t) => t.toLowerCase()));

  const save = async () => {
    setShowErrors(true);
    if (nameError || !campaignId) return;
    const toSave = { ...current, name: current.name.trim(), campaignId };
    await saveEncounter(toSave);
    // Combats staged from it follow it to its new campaign.
    if (id) await moveEncounterCombats(toSave.id, campaignId);
    setDraft(toSave);
    setTagText(toSave.tags.join(', '));
    setSaved(JSON.stringify(toSave));
    setJustSaved(true);
    if (!id) navigate(`/encounters/${toSave.id}`, { replace: true, state: { saved: true } });
  };

  const leave = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate('/encounters');
  };

  return (
    <>
      <PageHeader title={id ? 'Edit encounter' : 'New encounter'}>
        {id && (
          <>
            <Button
              variant="primary"
              disabled={dirty || draft.entries.length === 0 || stats.monsterCount === 0}
              title={dirty ? 'Save your changes first' : 'Make a ready-to-run combat from this encounter'}
              onClick={async () => navigate(`/combats/${await stageEncounter(draft.id)}`)}
            >
              Stage
            </Button>
            <Button
              onClick={async () => {
                if (dirty && !confirm('Duplicate the saved version? Unsaved changes here are discarded.')) return;
                navigate(`/encounters/${await duplicateAndSaveEncounter(draft.id)}`);
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (await confirmAndDeleteEncounter(draft)) navigate('/encounters', { replace: true });
              }}
            >
              Delete
            </Button>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 pb-24 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Goblin ambush"
                autoFocus={!id}
                className={showErrors && nameError ? 'border-red-600' : ''}
              />
            </Field>
            <Field label="Description">
              <TextArea
                value={draft.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Where, when, tactics…"
                rows={2}
              />
            </Field>
            {campaigns && campaigns.length > 1 && id && (
              <Field label="Campaign" hint="moving it takes its staged combats along">
                <Select value={campaignOf(draft)} onChange={(e) => set({ campaignId: e.target.value })}>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || 'Untitled'}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Tags" hint="comma-separated, e.g. session or adventure">
              <TextInput value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Session 3, Lost Mine" />
            </Field>
            {knownTags.some((t) => !currentTagKeys.has(t.toLowerCase())) && (
              <div className="-mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                Add tag:
                {knownTags
                  .filter((t) => !currentTagKeys.has(t.toLowerCase()))
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="rounded-full border border-stone-700 px-2 py-0.5 text-stone-400 hover:border-stone-500 hover:text-stone-200"
                      onClick={() => setTagText(parseTags(`${tagText},${t}`).join(', '))}
                    >
                      {t}
                    </button>
                  ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 font-display text-lg font-semibold text-amber-300">
              Creatures{' '}
              <span className="text-sm font-normal text-stone-400">
                ({stats.monsterCount} total)
              </span>
            </h2>
            {draft.entries.length === 0 && (
              <p className="text-sm text-stone-500">Add creatures from the bestiary.</p>
            )}
            <ul aria-label="Creatures in this encounter">
              {draft.entries.map((e) => {
                const t = templates.get(e.templateId);
                if (!t) {
                  return (
                    <li key={e.templateId} className="flex items-center gap-2 border-t border-stone-800 py-2 first:border-t-0">
                      <span className="flex-1 text-sm text-amber-400">
                        {e.count}× a deleted stat block (left out of totals and staging)
                      </span>
                      <Button variant="ghost" onClick={() => setDraft(setEntryCount(draft, e.templateId, 0))}>
                        Remove
                      </Button>
                    </li>
                  );
                }
                return (
                  <li key={e.templateId} className="flex flex-wrap items-center gap-2 border-t border-stone-800 py-2 first:border-t-0">
                    <div className="min-w-32 flex-1">
                      <div className="font-semibold text-stone-100">{t.name}</div>
                      <div className="text-xs text-stone-500">
                        CR {t.cr} · {t.xp.toLocaleString()} XP each
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label={`One fewer ${t.name}`}
                        onClick={() => setDraft(addToEncounter(draft, e.templateId, -1))}
                      >
                        −
                      </Button>
                      <NumberField
                        aria-label={`Number of ${t.name}`}
                        value={e.count}
                        min={1}
                        max={MAX_COUNT}
                        onChange={(n) => setDraft(setEntryCount(draft, e.templateId, n))}
                        className="w-14 text-center"
                      />
                      <Button
                        aria-label={`One more ${t.name}`}
                        disabled={e.count >= MAX_COUNT}
                        onClick={() => setDraft(addToEncounter(draft, e.templateId))}
                      >
                        +
                      </Button>
                    </div>
                    <div className="w-24 text-right text-sm tabular-nums text-stone-400">
                      {(t.xp * e.count).toLocaleString()} XP
                    </div>
                    <Button variant="ghost" aria-label={`Remove ${t.name}`} onClick={() => setDraft(setEntryCount(draft, e.templateId, 0))}>
                      ✕
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold text-amber-300">Difficulty</h2>
            <DifficultyPanel stats={stats} />
            {players && players.length > 0 ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-xs text-stone-400">
                  Rate against (preview only; players are picked when the combat starts)
                </legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {players.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-sm text-stone-300">
                      <input
                        type="checkbox"
                        className="accent-amber-500"
                        checked={!excluded.has(p.id)}
                        onChange={() => {
                          const next = new Set(excluded);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          setExcluded(next);
                        }}
                      />
                      {p.name}
                      <span className="text-xs text-stone-500">{p.level ? `lvl ${p.level}` : 'no level'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="text-xs text-stone-500">
                Add players to the{' '}
                <Link to="/party" className="text-amber-400 hover:underline">
                  party roster
                </Link>{' '}
                to rate difficulty.
              </p>
            )}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <CreaturePicker creatures={creatures ?? []} onAdd={(tid) => setDraft(addToEncounter(draft, tid))} />
        </aside>
      </div>

      <div className="fixed bottom-0 left-[var(--nav-width,0px)] right-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3 px-4 py-3">
          {showErrors && nameError && <p className="mr-auto text-xs text-red-400">{nameError}</p>}
          {!dirty && justSaved && <p className="mr-auto text-xs text-emerald-400" role="status">Saved.</p>}
          {dirty && !(showErrors && nameError) && <p className="mr-auto text-xs text-stone-500">Unsaved changes</p>}
          <Button variant="ghost" onClick={leave}>
            {dirty ? 'Cancel' : 'Back'}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!dirty && !!id}>
            Save encounter
          </Button>
        </div>
      </div>
    </>
  );
}
