import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openHucDb, deleteHucDb, type HucDatabase } from '../../src/storage/db';
import { DB_VERSION, migrations, runMigrations } from '../../src/storage/migrations';
import { Repo } from '../../src/storage/repo';
import {
  DEFAULT_SETTINGS,
  type Attempt,
  type Cheer,
  type FamilyCallRecord,
  type Profile,
  type ReceivedResult,
} from '../../src/storage/schemas';

let n = 0;
let name = '';
let db: HucDatabase;
let repo: Repo;

beforeEach(async () => {
  name = `huc-test-${String(++n)}`;
  db = await openHucDb(name);
  repo = new Repo(db);
});

const profile: Profile = {
  id: 'profile-0001',
  addressTerm: 'Paati',
  coachName: 'Arjun',
  enabledCategories: ['bank', 'tech'],
  legitRate: 0.4,
  createdAt: '2026-10-20T08:00:00.000Z',
};

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  localDate: '2026-10-20',
  scored: true,
  scenarioId: 'S01-bank-code',
  variantKey: 'S01-bank-code#address=3,org=1',
  kind: 'scam',
  path: ['hello', 'intro', 'warning'],
  action: 'hangup',
  tActionMs: 6400,
  tFlagMs: 5700,
  tAskMs: 40_200,
  tEndMs: 52_000,
  outcome: 'sharp',
  points: 100,
  tacticsBeforeAsk: ['authority', 'urgency'],
  ...over,
});

const cheer = (id: string, receivedAt: string): Cheer => ({
  id,
  from: 'Arjun',
  mime: 'audio/mp4',
  audio: new Blob([Uint8Array.from([1, 2, 3, 4, 5])], { type: 'audio/mp4' }),
  receivedAt,
  text: 'Nice one, Paati!',
});

describe('schema and migrations', () => {
  it('creates every store and the date index', () => {
    expect([...db.objectStoreNames].sort()).toEqual(
      ['attempts', 'cheers', 'corrupt', 'familyCalls', 'inbox', 'profile', 'settings', 'tactics'].sort(),
    );
    expect([...db.transaction('attempts').store.indexNames]).toEqual(['byDate']);
    expect(db.version).toBe(DB_VERSION);
  });
  it('reopening an existing database keeps its data', async () => {
    await repo.putProfile(profile);
    db.close();
    const again = new Repo(await openHucDb(name));
    expect(await again.getProfile()).toEqual(profile);
  });
  it('has one migration per version and refuses a gap', () => {
    for (let v = 1; v <= DB_VERSION; v++) expect(migrations[v], `v${String(v)}`).toBeTypeOf('function');
    const fake = {} as never;
    expect(() => runMigrations(fake, DB_VERSION, DB_VERSION + 1, fake)).toThrow(
      /No migration to schema version/,
    );
    expect(() => runMigrations(fake, 0, 0, fake)).not.toThrow();
  });
  it('deleting the database removes everything', async () => {
    await repo.putProfile(profile);
    db.close();
    await deleteHucDb(name);
    const fresh = new Repo(await openHucDb(name));
    expect(await fresh.getProfile()).toBeUndefined();
  });
});

describe('profile and settings', () => {
  it('starts empty and stores one profile', async () => {
    expect(await repo.getProfile()).toBeUndefined();
    await repo.putProfile(profile);
    expect(await repo.getProfile()).toEqual(profile);
    await repo.putProfile({ ...profile, addressTerm: 'Nana' });
    expect((await repo.getProfile())?.addressTerm).toBe('Nana');
  });
  it('refuses to store an invalid profile', async () => {
    await expect(repo.putProfile({ ...profile, legitRate: 0.9 })).rejects.toThrow();
    await expect(repo.putProfile({ ...profile, id: 'x' })).rejects.toThrow();
    await expect(repo.putProfile({ ...profile, createdAt: 'yesterday' })).rejects.toThrow();
    expect(await repo.getProfile()).toBeUndefined();
  });
  it('returns defaults until settings are saved', async () => {
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ captions: true, textSize: 'standard', theme: 'system' });
    await repo.putSettings({
      ...DEFAULT_SETTINGS,
      textSize: 'larger',
      reminderTime: '09:00',
      audioFormat: 'aac',
    });
    expect(await repo.getSettings()).toMatchObject({
      textSize: 'larger',
      reminderTime: '09:00',
      audioFormat: 'aac',
    });
    await expect(repo.putSettings({ ...DEFAULT_SETTINGS, reminderTime: '25:00' })).rejects.toThrow();
  });
});

describe('attempts', () => {
  it('lists oldest first and finds a day', async () => {
    await repo.addAttempt(attempt({ localDate: '2026-10-18', points: 70, outcome: 'late' }));
    await repo.addAttempt(attempt({ localDate: '2026-10-19', scored: false }));
    await repo.addAttempt(
      attempt({ localDate: '2026-10-19', scenarioId: 'L01-pharmacy-refill', kind: 'legit' }),
    );
    expect((await repo.listAttempts()).map((a) => a.localDate)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-19',
    ]);
    expect(await repo.attemptsOn('2026-10-19')).toHaveLength(2);
    expect(await repo.attemptsOn('2026-10-17')).toEqual([]);
  });
  it('rejects an invalid attempt', async () => {
    await expect(repo.addAttempt(attempt({ points: 150 }))).rejects.toThrow();
    await expect(repo.addAttempt(attempt({ localDate: '2026-02-30' }))).rejects.toThrow();
    await expect(repo.addAttempt(attempt({ outcome: 'won' as never }))).rejects.toThrow();
    expect(await repo.listAttempts()).toEqual([]);
  });
  it('round-trips optional fields: a call nobody acted on has no action time', async () => {
    const { tActionMs: _a, ...caught } = attempt({ action: 'none', outcome: 'caught', points: 0 });
    await repo.addAttempt(caught);
    const [got] = await repo.listAttempts();
    expect(got).toEqual(caught);
    expect(got && 'tActionMs' in got).toBe(false);
  });
});

describe('quarantine (ADR 3.5): a damaged row never stops the app', () => {
  it('moves an invalid attempt to the corrupt store and returns the good ones', async () => {
    await repo.addAttempt(attempt());
    await db.add('attempts', { localDate: 'not-a-date', junk: true } as never);
    await repo.addAttempt(attempt({ localDate: '2026-10-21' }));
    const list = await repo.listAttempts();
    expect(list.map((a) => a.localDate)).toEqual(['2026-10-20', '2026-10-21']);
    expect(await repo.corruptCount()).toBe(1);
    expect(await db.count('attempts')).toBe(2); // the bad row left the live store
    const [record] = await db.getAll('corrupt');
    expect(record).toMatchObject({ store: 'attempts' });
    expect(record?.reason.length).toBeGreaterThan(0);
    expect(record?.reason.length).toBeLessThanOrEqual(300);
    expect(await repo.listAttempts()).toHaveLength(2); // second read finds nothing new to quarantine
    expect(await repo.corruptCount()).toBe(1);
  });
  it('quarantines a damaged profile and a damaged settings record', async () => {
    await db.put('profile', { id: 'x' } as never, 'me');
    expect(await repo.getProfile()).toBeUndefined();
    await db.put('settings', { theme: 'neon' } as never, 'settings');
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await repo.corruptCount()).toBe(2);
    expect(await db.get('profile', 'me')).toBeUndefined();
  });
  it('quarantines a cheer whose audio is not a Blob', async () => {
    await db.put('cheers', { ...cheer('c1', '2026-10-20T10:00:00.000Z'), audio: 'not a blob' } as never);
    await repo.putCheer(cheer('c2', '2026-10-20T11:00:00.000Z'));
    expect((await repo.listCheers()).map((c) => c.id)).toEqual(['c2']);
    expect(await repo.corruptCount()).toBe(1);
  });
});

describe('tactic boxes', () => {
  it('replaces the whole set', async () => {
    await repo.putTacticBoxes([
      { tactic: 'urgency', box: 1, lastSeen: '2026-10-20' },
      { tactic: 'fear', box: 3, lastSeen: '2026-10-19' },
    ]);
    expect((await repo.getTacticBoxes()).map((b) => b.tactic).sort()).toEqual(['fear', 'urgency']);
    await repo.putTacticBoxes([{ tactic: 'urgency', box: 2, lastSeen: '2026-10-21' }]);
    expect(await repo.getTacticBoxes()).toEqual([{ tactic: 'urgency', box: 2, lastSeen: '2026-10-21' }]);
  });
  it('rejects an invalid box without losing the existing ones', async () => {
    await repo.putTacticBoxes([{ tactic: 'urgency', box: 1, lastSeen: '2026-10-20' }]);
    await expect(
      repo.putTacticBoxes([{ tactic: 'urgency', box: 9 as never, lastSeen: '2026-10-20' }]),
    ).rejects.toThrow();
    expect(await repo.getTacticBoxes()).toHaveLength(1);
  });
  it('saveCall writes the attempt and replaces the boxes together', async () => {
    await repo.putTacticBoxes([{ tactic: 'fear', box: 3, lastSeen: '2026-10-19' }]);
    await repo.saveCall(attempt(), [{ tactic: 'urgency', box: 1, lastSeen: '2026-10-20' }]);
    expect(await repo.listAttempts()).toHaveLength(1);
    expect(await repo.getTacticBoxes()).toEqual([{ tactic: 'urgency', box: 1, lastSeen: '2026-10-20' }]);
    await repo.saveCall(attempt({ localDate: '2026-10-21', scored: false }));
    expect(await repo.listAttempts()).toHaveLength(2);
    expect(await repo.getTacticBoxes()).toHaveLength(1); // a practice call leaves the boxes alone
  });
  it('saveCall writes nothing when part of it is invalid', async () => {
    await expect(
      repo.saveCall(attempt(), [{ tactic: 'urgency', box: 9 as never, lastSeen: '2026-10-20' }]),
    ).rejects.toThrow();
    expect(await repo.listAttempts()).toHaveLength(0);
  });
});

describe('cheers', () => {
  it('stores audio bytes and lists newest first', async () => {
    await repo.putCheer(cheer('a', '2026-10-01T10:00:00.000Z'));
    await repo.putCheer(cheer('b', '2026-10-02T10:00:00.000Z'));
    const list = await repo.listCheers();
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
    expect(list[0]?.audio.size).toBe(5);
    expect(
      new Uint8Array(await (list[0]?.audio.arrayBuffer() ?? Promise.resolve(new ArrayBuffer(0)))),
    ).toEqual(Uint8Array.from([1, 2, 3, 4, 5]));
    expect(list[0]?.mime).toBe('audio/mp4');
  });
  it('deletes one cheer', async () => {
    await repo.putCheer(cheer('a', '2026-10-01T10:00:00.000Z'));
    await repo.deleteCheer('a');
    expect(await repo.listCheers()).toEqual([]);
  });
});

describe('family calls', () => {
  const rec = (id: string, receivedAt: string): FamilyCallRecord => ({
    id,
    from: 'Arjun',
    receivedAt,
    played: false,
    call: {
      kind: 'scam',
      caller: 'Sam',
      opener: 'Hi Nana.',
      warning: 'Keep it quiet.',
      ask: 'Buy gift cards.',
      advice: 'Hang up and ring Sam.',
    },
  });
  it('stores, lists oldest first, marks played and deletes', async () => {
    await repo.putFamilyCall(rec('fam00002', '2026-10-02T00:00:00.000Z'));
    await repo.putFamilyCall(rec('fam00001', '2026-10-01T00:00:00.000Z'));
    expect((await repo.listFamilyCalls()).map((c) => c.id)).toEqual(['fam00001', 'fam00002']);
    await repo.markFamilyCallPlayed('fam00001');
    expect((await repo.getFamilyCall('fam00001'))?.played).toBe(true);
    expect((await repo.getFamilyCall('fam00002'))?.played).toBe(false);
    await repo.markFamilyCallPlayed('nope'); // no-op
    await repo.deleteFamilyCall('fam00001');
    expect(await repo.getFamilyCall('fam00001')).toBeUndefined();
  });
  it('rejects an id that is not link-safe', async () => {
    await expect(repo.putFamilyCall(rec('BAD ID!', '2026-10-01T00:00:00.000Z'))).rejects.toThrow();
  });
});

describe('coach inbox', () => {
  const item = (id: string, receivedAt: string): ReceivedResult => ({
    id,
    receivedAt,
    payload: {
      v: 1,
      t: 'result',
      name: 'Paati',
      date: '2026-10-20',
      title: 'a fake bank call',
      kind: 'scam',
      outcome: 'sharp',
      streak: 2,
    },
  });
  it('lists newest first, removes one, clears all', async () => {
    await repo.putInbox(item('a', '2026-10-01T10:00:00.000Z'));
    await repo.putInbox(item('b', '2026-10-02T10:00:00.000Z'));
    expect((await repo.listInbox()).map((i) => i.id)).toEqual(['b', 'a']);
    await repo.deleteInbox('b');
    expect((await repo.listInbox()).map((i) => i.id)).toEqual(['a']);
    await repo.clearInbox();
    expect(await repo.listInbox()).toEqual([]);
  });
});

describe('delete everything (SPEC 10.1)', () => {
  it('empties every store, including the quarantine', async () => {
    await repo.putProfile(profile);
    await repo.putSettings({ ...DEFAULT_SETTINGS, sound: false });
    await repo.addAttempt(attempt());
    await repo.putTacticBoxes([{ tactic: 'urgency', box: 1, lastSeen: '2026-10-20' }]);
    await repo.putCheer(cheer('a', '2026-10-01T10:00:00.000Z'));
    await db.add('attempts', { junk: 1 } as never);
    await repo.listAttempts(); // quarantines the junk row
    expect(await repo.corruptCount()).toBe(1);

    await repo.deleteEverything();
    for (const store of db.objectStoreNames) expect(await db.count(store), store).toBe(0);
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('upgrading from an older version', () => {
  it('a database created by version 1 code opens unchanged', async () => {
    const raw = await openDB(`${name}-legacy`, 1, {
      upgrade: (d) => void migrations[1]?.(d as never, undefined as never),
    });
    await raw.put('profile', profile, 'me');
    raw.close();
    const reopened = new Repo(await openHucDb(`${name}-legacy`));
    expect(await reopened.getProfile()).toEqual(profile);
  });
});
