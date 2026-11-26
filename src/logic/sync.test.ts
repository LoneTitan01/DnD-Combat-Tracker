import { describe, expect, it } from 'vitest';
import type { Player, SyncData } from '../models';
import { emptySyncData, mergeSyncData, parseSyncFile, sameSyncData } from './sync';

const player = (id: string, name: string, updatedAt?: number): Player => ({ id, name, initiativeBonus: 0, updatedAt });
const data = (patch: Partial<SyncData>): SyncData => ({ ...emptySyncData(), ...patch });

describe('mergeSyncData', () => {
  it('unions records from both sides', () => {
    const m = mergeSyncData(data({ players: [player('a', 'Aria', 1)] }), data({ players: [player('b', 'Brom', 1)] }));
    expect(m.players.map((p) => p.name).sort()).toEqual(['Aria', 'Brom']);
  });

  it('keeps the newer copy of the same record, and this device’s copy on a tie', () => {
    const local = data({ players: [player('a', 'Aria', 5), player('b', 'Brom (mine)', 3)] });
    const remote = data({ players: [player('a', 'Aria (old)', 4), player('b', 'Brom (theirs)', 3)] });
    const m = mergeSyncData(local, remote);
    expect(m.players.find((p) => p.id === 'a')!.name).toBe('Aria');
    expect(m.players.find((p) => p.id === 'b')!.name).toBe('Brom (mine)');
    expect(mergeSyncData(remote, { ...local, players: [player('a', 'Aria v6', 6)] }).players.find((p) => p.id === 'a')!.name).toBe('Aria v6');
  });

  it('treats records saved before sync existed (no updatedAt) as oldest', () => {
    const m = mergeSyncData(data({ players: [player('a', 'Old')] }), data({ players: [player('a', 'New', 1)] }));
    expect(m.players[0]!.name).toBe('New');
  });

  it('a deletion removes copies saved before it, on either side', () => {
    const local = data({ players: [player('a', 'Aria', 5)] });
    const remote = data({ deletions: [{ table: 'players', id: 'a', deletedAt: 10 }] });
    const m = mergeSyncData(local, remote);
    expect(m.players).toEqual([]);
    expect(m.deletions).toHaveLength(1);
    expect(mergeSyncData(remote, local).players).toEqual([]);
  });

  it('merges NPCs and their deletions', () => {
    const npc = (id: string, name: string, updatedAt: number) => ({ id, campaignId: 'c', name, updatedAt });
    const m = mergeSyncData(
      data({ npcs: [npc('a', 'Old Tom', 5), npc('b', 'Sildar', 5)] }),
      data({ npcs: [npc('a', 'Old Tom (newer)', 6)], deletions: [{ table: 'npcs', id: 'b', deletedAt: 10 }] }),
    );
    expect(m.npcs.map((n) => n.name)).toEqual(['Old Tom (newer)']);
  });

  it('a copy saved after the deletion survives', () => {
    const m = mergeSyncData(
      data({ players: [player('a', 'Aria again', 20)] }),
      data({ deletions: [{ table: 'players', id: 'a', deletedAt: 10 }] }),
    );
    expect(m.players.map((p) => p.name)).toEqual(['Aria again']);
  });

  it('deletions only apply to their own table', () => {
    const m = mergeSyncData(
      data({ players: [player('x', 'Aria', 1)] }),
      data({ deletions: [{ table: 'creatures', id: 'x', deletedAt: 10 }] }),
    );
    expect(m.players).toHaveLength(1);
  });

  it('merges deletions by the latest time', () => {
    const m = mergeSyncData(
      data({ deletions: [{ table: 'players', id: 'a', deletedAt: 3 }] }),
      data({ deletions: [{ table: 'players', id: 'a', deletedAt: 7 }] }),
    );
    expect(m.deletions).toEqual([{ table: 'players', id: 'a', deletedAt: 7 }]);
  });
});

describe('sameSyncData', () => {
  it('compares records by id and version, and deletions', () => {
    const a = data({ players: [player('a', 'Aria', 1), player('b', 'Brom', 2)] });
    expect(sameSyncData(a, data({ players: [player('b', 'Brom', 2), player('a', 'Aria', 1)] }))).toBe(true);
    expect(sameSyncData(a, data({ players: [player('a', 'Aria', 1)] }))).toBe(false);
    expect(sameSyncData(a, data({ players: [player('a', 'Aria', 9), player('b', 'Brom', 2)] }))).toBe(false);
    expect(sameSyncData(a, { ...a, deletions: [{ table: 'combats', id: 'c', deletedAt: 1 }] })).toBe(false);
  });
});

describe('parseSyncFile', () => {
  it('accepts our files and fills missing lists', () => {
    const f = parseSyncFile({ app: 'dm-combat-tracker', format: 1, savedAt: 5, players: [player('a', 'Aria', 1)] });
    expect(f.players).toHaveLength(1);
    expect(f.creatures).toEqual([]);
    expect(f.deletions).toEqual([]);
  });

  it('rejects other files and newer formats', () => {
    expect(() => parseSyncFile({ hello: 1 })).toThrow(/isn’t a DM Helper sync file/);
    expect(() => parseSyncFile(null)).toThrow();
    expect(() => parseSyncFile({ app: 'dm-combat-tracker', format: 2 })).toThrow(/newer version/);
  });

  it('keeps usable shortcuts and drops broken ones', () => {
    const base = { app: 'dm-combat-tracker', format: 1, savedAt: 5 };
    expect(parseSyncFile(base).hotkeys).toBeUndefined();
    expect(parseSyncFile({ ...base, hotkeys: { keys: { nextTurn: 't', bad: 3 }, updatedAt: 9 } }).hotkeys).toEqual({
      keys: { nextTurn: 't' },
      updatedAt: 9,
    });
    expect(parseSyncFile({ ...base, hotkeys: { keys: { nextTurn: 't' } } }).hotkeys).toBeUndefined();
  });
});
