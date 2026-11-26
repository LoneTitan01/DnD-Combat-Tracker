import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Card, Chip, Field, PageHeader, Select, TextArea, TextInput } from '../../components/ui';
import { db, saveLocation, setLocationNpcs } from '../../db';
import {
  blankLocation,
  childOptions,
  childrenOf,
  findItemByName,
  findNpcByName,
  itemSubtitle,
  itemsToStock,
  parentOptions,
  parsePriceBound,
  parseStock,
  placeLabel,
  SHOP_KIND_GROUPS,
  shopItemFor,
  shopOnlyItem,
  validateLocation,
} from '../../logic';
import type { ID, Item, Location, Npc, ShopItem } from '../../models';
import { useLocations, useNpcs } from './shared';

interface Draft {
  location: Location;
  childIds: ID[];
  /** Existing NPCs who live here (some may move here from elsewhere on save). */
  npcIds: ID[];
  /** Names of NPCs to create here on save. */
  newNpcs: string[];
}

/** Removable chips for a list of names, with a picker to add more. */
function PickList({
  label,
  hint,
  chosen,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  chosen: Location[];
  options: Location[];
  onChange: (ids: ID[]) => void;
}) {
  const ids = chosen.map((l) => l.id);
  const left = options.filter((o) => !ids.includes(o.id));
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label} hint={hint}>
        <Select
          value=""
          disabled={left.length === 0}
          onChange={(e) => e.target.value && onChange([...ids, e.target.value])}
        >
          <option value="">{left.length ? 'Add…' : 'No other locations to add'}</option>
          {left.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      {chosen.length > 0 && <Chips label={label} items={chosen.map((l) => ({ key: l.id, text: l.name }))} onRemove={(k) => onChange(ids.filter((i) => i !== k))} />}
    </div>
  );
}

function Chips({ label, items, onRemove }: { label: string; items: { key: string; text: string }[]; onRemove: (key: string) => void }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1 rounded-full border border-stone-700 bg-stone-800/60 py-0.5 pl-2.5 pr-1 text-xs text-stone-200">
          {it.text}
          <button
            type="button"
            aria-label={`Remove ${it.text}`}
            className="rounded-full px-1 text-stone-400 hover:bg-stone-700 hover:text-stone-100"
            onClick={() => onRemove(it.key)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

const NPC_NAMES = 'location-npc-names';

/**
 * The NPCs who live here. Typing an existing NPC's name picks them (moving them here on save);
 * any other name becomes a new NPC.
 */
function NpcList({
  draft,
  npcs,
  locations,
  onChange,
}: {
  draft: Draft;
  npcs: Npc[];
  locations: Location[];
  onChange: (patch: Pick<Draft, 'npcIds' | 'newNpcs'>) => void;
}) {
  const [name, setName] = useState('');
  const { npcIds, newNpcs } = draft;
  const here = draft.location.id;
  const add = () => {
    const n = name.trim();
    if (!n) return;
    const existing = findNpcByName(npcs, n);
    if (existing) {
      if (!npcIds.includes(existing.id)) onChange({ npcIds: [...npcIds, existing.id], newNpcs });
    } else if (!newNpcs.some((x) => x.toLowerCase() === n.toLowerCase())) {
      onChange({ npcIds, newNpcs: [...newNpcs, n] });
    }
    setName('');
  };
  const byId = new Map(npcs.map((x) => [x.id, x]));
  const chips = [
    ...npcIds
      .map((id) => byId.get(id))
      .filter((x): x is Npc => !!x)
      .map((x) => {
        const from = x.locationId && x.locationId !== here ? placeLabel(locations, x.locationId) : '';
        return { key: x.id, text: from ? `${x.name} (moves from ${from})` : x.name };
      }),
    ...newNpcs.map((x) => ({ key: `new:${x}`, text: `${x} (new)` })),
  ];
  const remove = (key: string) =>
    key.startsWith('new:')
      ? onChange({ npcIds, newNpcs: newNpcs.filter((x) => `new:${x}` !== key) })
      : onChange({ npcIds: npcIds.filter((i) => i !== key), newNpcs });
  return (
    <div className="flex flex-col gap-1.5">
      <datalist id={NPC_NAMES}>
        {npcs
          .filter((x) => !npcIds.includes(x.id))
          .map((x) => (
            <option key={x.id} value={x.name} />
          ))}
      </datalist>
      <div className="flex items-end gap-2">
        <Field label="NPCs" hint="who lives here: pick one from the NPC list or type a new name" className="flex-1">
          <TextInput
            value={name}
            list={NPC_NAMES}
            placeholder="Aubrey"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </Field>
        <Button onClick={add} disabled={!name.trim()}>
          Add NPC
        </Button>
      </div>
      {chips.length > 0 && <Chips label="NPCs" items={chips} onRemove={remove} />}
    </div>
  );
}

const ITEM_NAMES = 'shop-item-names';

/** A stock count; empty means the shop doesn't count it. */
function StockInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
}) {
  return (
    <TextInput
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      aria-label={label}
      title={label.replace(/^Item \d+ /, '')}
      placeholder={placeholder}
      value={value ?? ''}
      className="w-20 min-w-0 tabular-nums"
      onChange={(e) => onChange(parseStock(e.target.value))}
    />
  );
}

/**
 * Stocks the shop with many items at once: every item of the picked kinds within a price range, e.g.
 * tools and musical instruments for 25 gp or under. Matches are listed first, and any can be unticked.
 */
function BulkStock({ items, catalog, onAdd, onClose }: { items: ShopItem[]; catalog: Item[]; onAdd: (picked: Item[]) => void; onClose: () => void }) {
  const [kinds, setKinds] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [magic, setMagic] = useState(false);
  const [skipped, setSkipped] = useState<Set<ID>>(new Set());
  const minCost = parsePriceBound(min);
  const maxCost = parsePriceBound(max);
  const badPrice = Number.isNaN(minCost) || Number.isNaN(maxCost);
  const matches = badPrice ? [] : itemsToStock(catalog, items, { kinds, minCost, maxCost, magic });
  const picked = matches.filter((i) => !skipped.has(i.id));
  const toggle = (keys: string[], on: boolean) => setKinds(on ? [...new Set([...kinds, ...keys])] : kinds.filter((k) => !keys.includes(k)));
  const skip = (id: ID) => {
    const next = new Set(skipped);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSkipped(next);
  };
  const priceHint = 'gold, or e.g. "5 sp"';
  return (
    <section aria-label="Stock by kind and price">
      <Card className="flex flex-col gap-3">
        <div role="group" aria-label="Kinds of item" className="flex flex-col gap-1.5">
          <p className="text-xs text-stone-400">
            Kinds <span className="text-stone-500">{kinds.length ? '' : 'none picked, so every kind'}</span>
          </p>
          {SHOP_KIND_GROUPS.map((g) => {
            const keys = g.kinds.map((k) => k.key);
            const all = keys.every((k) => kinds.includes(k));
            return (
              <div key={g.category} className="flex flex-wrap items-center gap-1.5">
                {keys.length > 1 && (
                  <Chip on={all} onClick={() => toggle(keys, !all)}>
                    {`All ${g.label.toLowerCase()}`}
                  </Chip>
                )}
                {g.kinds.map((k) => {
                  const on = kinds.includes(k.key);
                  return (
                    <Chip key={k.key} on={on} onClick={() => toggle([k.key], !on)}>
                      {k.label}
                    </Chip>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Min price" hint={priceHint} className="w-36">
            <TextInput value={min} placeholder="0" onChange={(e) => setMin(e.target.value)} />
          </Field>
          <Field label="Max price" hint={priceHint} className="w-36">
            <TextInput value={max} placeholder="25" onChange={(e) => setMax(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm text-stone-300">
            <input type="checkbox" className="accent-amber-500" checked={magic} onChange={(e) => setMagic(e.target.checked)} />
            Include magic items
          </label>
        </div>
        {badPrice ? (
          <p className="text-xs text-red-300">Prices are a number of gold pieces, or an amount like "5 sp".</p>
        ) : matches.length === 0 ? (
          <p className="text-xs text-stone-500">
            Nothing in the item list matches that isn't already for sale here.
            {minCost !== undefined || maxCost !== undefined ? ' Items with no price in the item list are left out when filtering by price.' : ''}
          </p>
        ) : (
          <ul aria-label="Matching items" className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {matches.map((i) => (
              <li key={i.id}>
                <label className="flex items-baseline gap-2 text-sm">
                  <input type="checkbox" className="accent-amber-500" checked={!skipped.has(i.id)} onChange={() => skip(i.id)} />
                  <span className="text-stone-100">{i.name}</span>
                  <span className="text-xs text-stone-500">{[i.cost, itemSubtitle(i)].filter(Boolean).join(' · ')}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button variant="primary" disabled={!picked.length} onClick={() => onAdd(picked)}>
            {picked.length === 1 ? 'Add 1 item' : `Add ${picked.length} items`}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </Card>
    </section>
  );
}

/**
 * The shop table: one row per item for sale, in the order they're listed. Items are picked from the
 * item list and start at its price, which each shop can change. Anything not in the item list can be
 * added as a shop-only item, with its own name and description.
 */
function ShopEditor({ items, catalog, onChange }: { items: ShopItem[]; catalog: Item[]; onChange: (items: ShopItem[]) => void }) {
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState(false);
  const set = (id: ID, patch: Partial<ShopItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const byId = new Map(catalog.map((i) => [i.id, i]));
  const stocked = new Set(items.map((i) => i.itemId));
  const typed = name.trim();
  const match = findItemByName(catalog, name);
  const duplicateShopOnly = match ? undefined : findItemByName(items.filter((i) => !i.itemId), name);
  const add = () => {
    if (!match) return;
    if (!stocked.has(match.id)) onChange([...items, shopItemFor(match)]);
    setName('');
  };
  const addShopOnly = () => {
    if (!typed || match || duplicateShopOnly) return;
    onChange([...items, shopOnlyItem(typed)]);
    setName('');
  };
  return (
    <section aria-label="Shop" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs text-stone-400">
          Shop
          <span className="ml-1.5 text-stone-500">
            optional: what's for sale here. Leave Stock and Max empty for items the shop doesn't count; restocking fills each item back up to its Max.
          </span>
        </h2>
      </div>
      {items.length > 0 && (
        <ol aria-label="Shop items" className="flex flex-col gap-3">
          {items.map((item, n) => {
            const listed = item.itemId ? byId.get(item.itemId) : undefined;
            return (
            <li key={item.id} className="flex flex-wrap items-start gap-2 border-b border-stone-800 pb-3 last:border-0 last:pb-0">
              {item.itemId ? (
                <div aria-label={`Item ${n + 1}`} className="min-w-40 flex-[2] py-1.5 text-sm">
                  <span className="font-medium text-stone-100">{listed?.name ?? item.name}</span>
                  <span className="ml-2 text-xs text-stone-500">{listed ? itemSubtitle(listed) : 'no longer in the item list'}</span>
                </div>
              ) : (
                <div className="flex min-w-40 flex-[2] items-center gap-2">
                  <TextInput
                    aria-label={`Item ${n + 1} name`}
                    placeholder="Item"
                    value={item.name}
                    className="min-w-0 flex-1"
                    onChange={(e) => set(item.id, { name: e.target.value })}
                  />
                  <span className="whitespace-nowrap text-xs text-stone-500">shop only</span>
                </div>
              )}
              <TextInput
                aria-label={`Item ${n + 1} cost`}
                placeholder={listed?.cost || 'Cost'}
                value={item.cost}
                className="w-24 min-w-0 flex-1 sm:flex-none"
                onChange={(e) => set(item.id, { cost: e.target.value })}
              />
              <StockInput label={`Item ${n + 1} in stock`} placeholder="Stock" value={item.stock} onChange={(stock) => set(item.id, { stock })} />
              <StockInput label={`Item ${n + 1} max stock`} placeholder="Max" value={item.maxStock} onChange={(maxStock) => set(item.id, { maxStock })} />
              <Button
                variant="ghost"
                aria-label={`Remove item ${n + 1}`}
                className="px-2"
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
              >
                ×
              </Button>
              <TextInput
                aria-label={`Item ${n + 1} description`}
                placeholder={item.itemId ? 'Note (optional), e.g. "dwarven steel, slightly used"' : 'Description'}
                value={item.description}
                className="w-full"
                onChange={(e) => set(item.id, { description: e.target.value })}
              />
            </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-col gap-1">
        <datalist id={ITEM_NAMES}>
          {catalog
            .filter((i) => !stocked.has(i.id))
            .map((i) => (
              <option key={i.id} value={i.name} />
            ))}
        </datalist>
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label={items.length ? 'Add an item' : 'Add a shop'}
            hint={catalog.length ? 'pick from the item list, or add a shop-only item' : 'the item list is empty, so items added here are shop-only'}
            className="min-w-48 flex-1"
          >
            <TextInput
              value={name}
              list={ITEM_NAMES}
              placeholder="Longsword"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Enter only picks from the item list, so a typo doesn't become a shop-only item.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
          </Field>
          {match || !typed ? (
            <Button onClick={add} disabled={!match}>
              Add item
            </Button>
          ) : (
            <Button onClick={addShopOnly} disabled={!!duplicateShopOnly}>
              Add as shop-only item
            </Button>
          )}
        </div>
        {typed && !match && (
          <p className="text-xs text-stone-500">
            {duplicateShopOnly ? (
              `${duplicateShopOnly.name} is already for sale here.`
            ) : (
              `“${typed}” isn't in the item list. Add it here for this shop only, or create it on the Items page to sell it anywhere.`
            )}
          </p>
        )}
        {match && stocked.has(match.id) && <p className="text-xs text-stone-500">{match.name} is already for sale here.</p>}
      </div>
      {catalog.length > 0 &&
        (bulk ? (
          <BulkStock
            items={items}
            catalog={catalog}
            onAdd={(picked) => {
              onChange([...items, ...picked.map(shopItemFor)]);
              setBulk(false);
            }}
            onClose={() => setBulk(false)}
          />
        ) : (
          <div>
            <Button variant="ghost" className="-ml-3" onClick={() => setBulk(true)}>
              Stock by kind and price…
            </Button>
          </div>
        ))}
    </section>
  );
}

export function LocationEditor() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { locations, campaignId } = useLocations();
  const npcs = useNpcs();
  const catalog = useLiveQuery(() => db.items.orderBy('name').toArray());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load once (not live) so background changes don't clobber the draft.
  useEffect(() => {
    if (draft || !campaignId) return;
    const start = (d: Draft) => {
      setDraft(d);
      setOriginal(JSON.stringify(d));
    };
    if (!id) {
      start({ location: blankLocation(campaignId, search.get('parent') ?? undefined), childIds: [], npcIds: [], newNpcs: [] });
      return;
    }
    void db.locations.get(id).then(async (l) => {
      if (!l) return setNotFound(true);
      const [kids, residents] = await Promise.all([
        db.locations.where('parentId').equals(id).toArray(),
        db.npcs.where('locationId').equals(id).toArray(),
      ]);
      start({ location: l, childIds: kids.map((k) => k.id), npcIds: residents.map((n) => n.id), newNpcs: [] });
    });
  }, [id, campaignId, draft, search]);

  const dirty = draft !== null && original !== '' && JSON.stringify(draft) !== original;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The saved locations, with this draft's own links in place of its saved ones.
  const others = useMemo(() => (locations ?? []).filter((l) => l.id !== draft?.location.id), [locations, draft?.location.id]);
  const errors = useMemo(() => {
    if (!draft) return [];
    const withDraft = [...others.map((o) => (draft.childIds.includes(o.id) ? { ...o, parentId: draft.location.id } : o)), draft.location];
    return validateLocation(draft.location, withDraft);
  }, [draft, others]);

  if (notFound) return <p className="text-stone-400">That location doesn't exist.</p>;
  if (!draft || !locations || !npcs || !catalog) return null;

  const loc = draft.location;
  const set = (patch: Partial<Location>) => setDraft({ ...draft, location: { ...loc, ...patch } });
  const byId = new Map(others.map((o) => [o.id, o]));
  const pick = (ids: ID[]) => ids.map((i) => byId.get(i)).filter((l): l is Location => !!l);
  // Options are worked out against the draft's links, so a place can't end up inside itself.
  const draftList = [
    ...others.map((o) =>
      draft.childIds.includes(o.id) ? { ...o, parentId: loc.id } : o.parentId === loc.id ? { ...o, parentId: undefined } : o,
    ),
    loc,
  ];
  const parents = parentOptions(draftList, loc.id);
  const kids = childOptions(draftList, loc);
  const sharedParent = loc.parentId ? childrenOf(others, loc.parentId).length : 0;

  const save = async () => {
    setShowErrors(true);
    if (errors.length) return;
    setSaving(true);
    // Keep each listed item's current name, in case it was renamed in the item list.
    const names = new Map(catalog.map((i) => [i.id, i.name]));
    const shop = loc.shop?.map((s) => (s.itemId && names.has(s.itemId) ? { ...s, name: names.get(s.itemId)! } : s));
    await saveLocation(shop ? { ...loc, shop } : loc, draft.childIds);
    await setLocationNpcs(loc.id, loc.campaignId, draft.npcIds, draft.newNpcs);
    setOriginal(JSON.stringify(draft));
    navigate(`/locations/${loc.id}`, { replace: true });
  };

  const cancel = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    navigate(id ? `/locations/${id}` : loc.parentId ? `/locations/${loc.parentId}` : '/locations');
  };

  return (
    <>
      <PageHeader title={id ? 'Edit location' : 'New location'} />
      <form
        className="mx-auto flex max-w-3xl flex-col gap-4 pb-24"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card className="flex flex-col gap-4">
          <Field label="Name">
            <TextInput value={loc.name} autoFocus={!id} placeholder="Leilon" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Inside of" hint="optional">
            <Select value={loc.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value || undefined })}>
              <option value="">Nowhere (top level)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <PickList
            label="Places inside"
            hint="optional"
            chosen={pick(draft.childIds)}
            options={kids}
            onChange={(childIds) => setDraft({ ...draft, childIds })}
          />
          <PickList
            label="Sibling locations"
            hint={
              sharedParent
                ? `optional; the ${sharedParent} other place${sharedParent === 1 ? '' : 's'} in the same parent ${sharedParent === 1 ? 'is' : 'are'} listed already`
                : 'optional, e.g. a neighbouring town'
            }
            chosen={pick(loc.siblingIds)}
            options={others}
            onChange={(siblingIds) => set({ siblingIds })}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <NpcList draft={draft} npcs={npcs} locations={locations} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <Field label="Notes">
            <TextArea
              rows={10}
              value={loc.notes}
              placeholder="What it looks like, who runs it, rumours, what's for sale…"
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>
        </Card>

        <Card>
          <ShopEditor items={loc.shop ?? []} catalog={catalog} onChange={(shop) => set({ shop })} />
        </Card>

        <div className="fixed bottom-0 left-[var(--nav-width,0px)] right-0 z-10 border-t border-stone-800 bg-stone-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3 px-4 py-3">
            {showErrors && errors.length > 0 && (
              <ul className="mr-auto text-xs text-red-400">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              Save location
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
