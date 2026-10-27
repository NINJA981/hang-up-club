import { beforeEach, describe, expect, it, vi } from 'vitest';
import { base64ToBlob, base64ToBytes, blobToBase64, bytesToBase64 } from '../../src/state/base64';
import { fakeClock, type FakeClock } from '../../src/domain/time/clock';
import { resolveVariant } from '../../src/domain/scenario/expand';
import { openHucDb } from '../../src/storage/db';
import { Repo } from '../../src/storage/repo';
import { AppController, resultCardId } from '../../src/state/app';
import { buildContent, loadContent, type FetchLike } from '../../src/state/library';
import {
  dailyPick,
  historyOf,
  latestCheer,
  practicePick,
  rate30Of,
  resolvePick,
  resolveVariantKey,
  resultCardFor,
  scheduleInput,
  streakOf,
  todaysScoredAttempt,
} from '../../src/state/selectors';
import { createStore } from '../../src/state/store';
import type { CheerLinkV1, FamilyLinkV1, JoinLinkV1, ResultCardV1 } from '../../src/domain/links/payloads';
import { realContent, realLibrary, realManifest } from './helpers/content';
import { justAfterFlag, letItRing, playCall } from './helpers/calls';

let n = 0;
let clock: FakeClock;
let repo: Repo;
let app: AppController;
let ids = 0;
const content = realContent();

const DAY1 = Date.parse('2026-10-20T09:00:00Z');
const newApp = (r: Repo = repo): AppController =>
  new AppController({ repo: r, clock, newId: () => `id-${String(++ids).padStart(6, '0')}` });
const s01 = () => {
  const t = content.byId.get('S01-bank-code');
  if (!t) throw new Error('S01');
  return resolveVariant(t, content.library.addressTerms, 0);
};
const l01 = () => {
  const t = content.byId.get('L01-pharmacy-refill');
  if (!t) throw new Error('L01');
  return resolveVariant(t, content.library.addressTerms, 0);
};

beforeEach(async () => {
  clock = fakeClock(DAY1, 'UTC');
  repo = new Repo(await openHucDb(`huc-state-${String(++n)}`));
  app = newApp();
  await app.load();
});

describe('store', () => {
  it('notifies on change, skips identical values, supports updater functions and unsubscribe', () => {
    const store = createStore({ n: 0 });
    const seen: number[] = [];
    const off = store.subscribe(() => seen.push(store.get().n));
    store.set({ n: 1 });
    const same = store.get();
    store.set(same);
    store.set((s) => ({ n: s.n + 1 }));
    off();
    store.set({ n: 99 });
    expect(seen).toEqual([1, 2]);
    expect(store.get().n).toBe(99);
  });
  it('keeps notifying others when a listener unsubscribes during a notification', () => {
    const store = createStore(0);
    const calls: string[] = [];
    const off = store.subscribe(() => {
      calls.push('a');
      off();
    });
    store.subscribe(() => calls.push('b'));
    store.set(1);
    store.set(2);
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});

describe('base64 helpers', () => {
  it('round-trips bytes and blobs', async () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    const blob = base64ToBlob(bytesToBase64(bytes), 'audio/mp4');
    expect(blob.type).toBe('audio/mp4');
    expect(await blobToBase64(blob)).toBe(bytesToBase64(bytes));
  });
});

describe('loading and profile', () => {
  it('starts ready with defaults and no profile', () => {
    expect(app.state).toMatchObject({
      status: 'ready',
      profile: undefined,
      attempts: [],
      cheers: [],
      today: '2026-10-20',
    });
    expect(app.state.settings.captions).toBe(true);
  });
  it('sets a player up with sensible defaults', async () => {
    const p = await app.setupProfile({ addressTerm: 'Paati' });
    expect(p).toMatchObject({ id: 'id-000001', addressTerm: 'Paati', legitRate: 0.4 });
    expect(p.enabledCategories).toHaveLength(8);
    expect(p.createdAt).toBe('2026-10-20T09:00:00.000Z');
    expect(await repo.getProfile()).toEqual(p);
  });
  it('keeps the same id and creation time when the profile is edited', async () => {
    const first = await app.setupProfile({ addressTerm: 'Paati', playerName: 'Meenakshi' });
    clock.advance(86_400_000);
    const second = await app.setupProfile({ addressTerm: 'Nana', coachName: 'Arjun' });
    expect(second).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      addressTerm: 'Nana',
      playerName: 'Meenakshi',
      coachName: 'Arjun',
    });
  });
  it('clamps an out-of-range rate rather than storing it', async () => {
    expect((await app.setupProfile({ addressTerm: 'Nana', legitRate: 0.9 })).legitRate).toBe(0.5);
  });
  it('opening a join link sets address term, coach and categories (AC-F8-1)', async () => {
    const link: JoinLinkV1 = {
      v: 1,
      t: 'join',
      coach: 'Arjun',
      address: 'Paati',
      player: 'Meenakshi',
      cats: ['bank', 'tech'],
      legitRate: 0.3,
    };
    const p = await app.applyJoin(link);
    expect(p).toMatchObject({
      addressTerm: 'Paati',
      coachName: 'Arjun',
      playerName: 'Meenakshi',
      enabledCategories: ['bank', 'tech'],
      legitRate: 0.3,
    });
    // opening it again changes nothing about identity
    expect((await app.applyJoin(link)).id).toBe(p.id);
  });
  it('persists across a restart', async () => {
    await app.setupProfile({ addressTerm: 'Paati' });
    await app.updateSettings({ textSize: 'larger' });
    const restarted = newApp();
    await restarted.load();
    expect(restarted.state.profile?.addressTerm).toBe('Paati');
    expect(restarted.state.settings.textSize).toBe('larger');
  });
  it('removes optional settings when they are cleared', async () => {
    await app.updateSettings({ reminderTime: '09:00' });
    expect(app.state.settings.reminderTime).toBe('09:00');
    await app.updateSettings({ reminderTime: undefined });
    expect('reminderTime' in app.state.settings).toBe(false);
    expect(await repo.getSettings()).not.toHaveProperty('reminderTime');
  });
  it('refreshToday follows the clock', () => {
    clock.advance(24 * 3_600_000);
    expect(app.state.today).toBe('2026-10-20');
    app.refreshToday();
    expect(app.state.today).toBe('2026-10-21');
  });
});

describe('recording calls', () => {
  beforeEach(async () => {
    await app.setupProfile({ addressTerm: 'Paati' });
  });

  it('scores, saves and publishes a daily scam call hung up at the first warning', async () => {
    const scenario = s01();
    const ended = playCall(scenario, { type: 'HANG_UP', tMs: justAfterFlag(scenario) });
    const { attempt, summary } = await app.recordCall({ ended, scenario, scored: true });
    expect(attempt).toMatchObject({
      localDate: '2026-10-20',
      scored: true,
      scenarioId: 'S01-bank-code',
      kind: 'scam',
      action: 'hangup',
      tActionMs: justAfterFlag(scenario),
      outcome: 'sharp',
    });
    expect(attempt.outcome).toBe(summary.result.outcome);
    expect(attempt.tAskMs).toBeGreaterThan(attempt.tActionMs ?? 0);
    expect(app.state.attempts).toHaveLength(1);
    expect(await repo.listAttempts()).toEqual([attempt]);
    expect(todaysScoredAttempt(app.state)).toEqual(attempt);
    expect(app.hasScoredToday()).toBe(true);
  });
  it('updates spaced repetition for a scored scam call: caught resets, sharp promotes', async () => {
    const scenario = s01();
    await app.recordCall({ ended: letItRing(scenario), scenario, scored: true });
    expect(app.state.tacticBoxes.length).toBeGreaterThan(0);
    expect(app.state.tacticBoxes.every((b) => b.box === 1 && b.lastSeen === '2026-10-20')).toBe(true);
    expect(await repo.getTacticBoxes()).toHaveLength(app.state.tacticBoxes.length);

    clock.advance(86_400_000);
    app.refreshToday();
    await app.recordCall({
      ended: playCall(scenario, { type: 'HANG_UP', tMs: justAfterFlag(scenario) }),
      scenario,
      scored: true,
    });
    expect(app.state.tacticBoxes.some((b) => b.box === 2)).toBe(true);
  });
  it('a second call the same day is recorded as practice, not scored, and leaves spaced repetition alone', async () => {
    const scenario = s01();
    await app.recordCall({
      ended: playCall(scenario, { type: 'HANG_UP', tMs: justAfterFlag(scenario) }),
      scenario,
      scored: true,
    });
    const boxes = structuredClone(app.state.tacticBoxes);
    const { attempt } = await app.recordCall({ ended: letItRing(scenario), scenario, scored: true });
    expect(attempt.scored).toBe(false);
    expect(app.state.tacticBoxes).toEqual(boxes);
    expect(app.state.attempts.filter((a) => a.scored)).toHaveLength(1);
  });
  it('an explicitly unscored practice call never counts toward the streak', async () => {
    const scenario = l01();
    await app.recordCall({ ended: letItRing(scenario), scenario, scored: false });
    expect(streakOf(app.state).current).toBe(0);
    expect(app.hasScoredToday()).toBe(false);
  });
  it('a legitimate call stayed on is right; hanging up is missed and does not touch spaced repetition', async () => {
    const scenario = l01();
    const stayed = await app.recordCall({ ended: letItRing(scenario), scenario, scored: true });
    expect(stayed.attempt).toMatchObject({ outcome: 'stayed', points: 100, kind: 'legit' });
    expect(stayed.attempt.tAskMs).toBeUndefined();
    expect(app.state.tacticBoxes).toEqual([]);
    clock.advance(86_400_000);
    app.refreshToday();
    const missed = await app.recordCall({
      ended: playCall(scenario, { type: 'HANG_UP', tMs: 800 }),
      scenario,
      scored: true,
    });
    expect(missed.attempt).toMatchObject({ outcome: 'missed', points: 20 });
  });
  it('calling back on the real bank alert scores 100 (the lesson)', async () => {
    const t = content.byId.get('L04-bank-fraud-alert');
    if (!t) throw new Error('L04');
    const scenario = resolveVariant(t, content.library.addressTerms, 0);
    const { attempt } = await app.recordCall({
      ended: playCall(scenario, { type: 'CALL_BACK', tMs: 9000 }),
      scenario,
      scored: true,
    });
    expect(attempt).toMatchObject({ outcome: 'verified', points: 100, action: 'callback' });
  });
  it('flags family calls so the scheduler can space them', async () => {
    const scenario = l01();
    const { attempt } = await app.recordCall({
      ended: letItRing(scenario),
      scenario,
      scored: true,
      family: true,
    });
    expect(attempt.family).toBe(true);
    expect(historyOf(app.state.attempts)[0]).toMatchObject({ family: true });
  });
  it('computes the streak and 30-day rate from what was recorded', async () => {
    const scenario = s01();
    for (let i = 0; i < 3; i++) {
      await app.recordCall({
        ended: playCall(scenario, { type: 'HANG_UP', tMs: justAfterFlag(scenario) }),
        scenario,
        scored: true,
      });
      clock.advance(86_400_000);
      app.refreshToday();
    }
    expect(streakOf(app.state).current).toBe(3);
    expect(rate30Of(app.state)).toBe(1);
  });
});

describe('receiving links', () => {
  const cheerLink: CheerLinkV1 = {
    v: 1,
    t: 'cheer',
    from: 'Arjun',
    mime: 'audio/mp4',
    b64: bytesToBase64(Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2])),
    text: 'Nice one, Paati!',
  };
  const familyLink: FamilyLinkV1 = {
    v: 1,
    t: 'family',
    from: 'Arjun',
    id: 'a1b2c3d4e5f6',
    call: {
      kind: 'scam',
      caller: 'Sam',
      opener: 'Nana, it is Sam.',
      warning: 'Keep it between us.',
      ask: 'Buy gift cards.',
      advice: 'Sam would never ask for gift cards.',
    },
  };
  const card: ResultCardV1 = {
    v: 1,
    t: 'result',
    name: 'Paati',
    date: '2026-10-20',
    title: 'a fake bank call',
    kind: 'scam',
    outcome: 'sharp',
    tAction: 6400,
    tAsk: 40_200,
    streak: 4,
  };

  it('stores a cheer with its audio and uses the newest (AC-F8-2)', async () => {
    const first = await app.acceptCheer(cheerLink);
    expect(first.audio.size).toBe(12);
    expect(first.audio.type).toBe('audio/mp4');
    clock.advance(1000);
    const second = await app.acceptCheer({ ...cheerLink, from: 'Sam' });
    expect(latestCheer(app.state)?.id).toBe(second.id);
    expect((await repo.listCheers()).map((c) => c.from)).toEqual(['Sam', 'Arjun']);
    await app.removeCheer(second.id);
    expect(latestCheer(app.state)?.id).toBe(first.id);
    expect(await repo.listCheers()).toHaveLength(1);
  });
  it('stores a family call once however many times the link is opened', async () => {
    const a = await app.acceptFamilyCall(familyLink);
    const b = await app.acceptFamilyCall(familyLink);
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(false);
    expect(app.state.familyCalls).toHaveLength(1);
    expect(await repo.listFamilyCalls()).toHaveLength(1);
    await app.markFamilyCallPlayed(familyLink.id);
    expect(app.state.familyCalls[0]?.played).toBe(true);
    expect((await repo.getFamilyCall(familyLink.id))?.played).toBe(true);
  });
  it('saves a result card to the coach inbox once, newest first (AC-F8-5)', async () => {
    expect((await app.saveResultCard(card)).isNew).toBe(true);
    expect((await app.saveResultCard(card)).isNew).toBe(false);
    clock.advance(1000);
    await app.saveResultCard({ ...card, date: '2026-10-21' });
    expect(app.state.inbox.map((i) => i.payload.date)).toEqual(['2026-10-21', '2026-10-20']);
    await app.removeInbox(app.state.inbox[0]?.id ?? '');
    expect(app.state.inbox).toHaveLength(1);
    await app.clearInbox();
    expect(app.state.inbox).toEqual([]);
    expect(await repo.listInbox()).toEqual([]);
  });
  it('identifies a card by its content', () => {
    expect(resultCardId(card)).toBe(resultCardId({ ...card, streak: 99 })); // streak alone does not make it new
    expect(resultCardId(card)).not.toBe(resultCardId({ ...card, outcome: 'late' }));
    expect(resultCardId({ ...card, title: 'x'.repeat(48), name: 'y'.repeat(30) }).length).toBeLessThanOrEqual(
      64,
    );
  });
});

describe('delete everything (SPEC 10.1)', () => {
  it('wipes state and storage together', async () => {
    await app.setupProfile({ addressTerm: 'Paati' });
    const scenario = s01();
    await app.recordCall({ ended: letItRing(scenario), scenario, scored: true });
    await app.deleteEverything();
    expect(app.state).toMatchObject({
      profile: undefined,
      attempts: [],
      tacticBoxes: [],
      cheers: [],
      familyCalls: [],
      inbox: [],
      status: 'ready',
    });
    const reloaded = newApp();
    await reloaded.load();
    expect(reloaded.state.profile).toBeUndefined();
    expect(reloaded.state.attempts).toEqual([]);
  });
});

describe('selectors', () => {
  it('give no call until a profile exists', () => {
    expect(scheduleInput(app.state, content)).toBeUndefined();
    expect(dailyPick(app.state, content)).toBeUndefined();
    expect(practicePick(app.state, content, 1)).toBeUndefined();
    expect(resultCardFor(app.state, {} as never, 'x')).toBeUndefined();
  });
  it('pick one daily call that stays the same all day, even after it is played', async () => {
    await app.setupProfile({ addressTerm: 'Paati' });
    const pick = dailyPick(app.state, content);
    expect(pick?.source).toBe('library');
    const scenario = resolvePick(content, pick ?? ({} as never), app.state);
    expect(scenario?.vars['address'] === undefined || scenario.vars['address'] === 'Paati').toBe(true);
    if (!scenario) throw new Error('unresolved');
    await app.recordCall({ ended: letItRing(scenario), scenario, scored: true });
    expect(dailyPick(app.state, content)).toEqual(pick);
  });
  it('offer practice calls that are not the daily template', async () => {
    await app.setupProfile({ addressTerm: 'Paati' });
    const daily = dailyPick(app.state, content);
    for (let i = 1; i <= 15; i++) {
      const p = practicePick(app.state, content, i);
      expect(
        p?.source === 'library' && daily?.source === 'library' && p.templateId === daily.templateId,
      ).toBe(false);
    }
  });
  it('resolve a family call from the stored draft and play it as a real scenario', async () => {
    await app.setupProfile({ addressTerm: 'Paati' });
    await app.acceptFamilyCall({
      v: 1,
      t: 'family',
      from: 'Arjun',
      id: 'a1b2c3d4e5f6',
      call: {
        kind: 'scam',
        caller: 'Sam',
        opener: 'Nana, it is Sam.',
        warning: 'Keep it between us.',
        ask: 'Buy gift cards.',
        advice: 'Sam would never ask for gift cards.',
      },
    });
    const scenario = resolvePick(
      content,
      { source: 'family', familyCallId: 'a1b2c3d4e5f6', kind: 'scam' },
      app.state,
    );
    expect(scenario?.templateId).toBe('F-a1b2c3d4e5f6');
    expect(scenario?.lines.map((l) => l.id)).toEqual(['opener', 'warning', 'ask', 'coda']);
    expect(
      resolvePick(content, { source: 'family', familyCallId: 'gone', kind: 'scam' }, app.state),
    ).toBeUndefined();
    expect(
      resolvePick(
        content,
        {
          source: 'library',
          templateId: 'nope',
          kind: 'scam',
          variant: 0,
          variantKey: 'x',
          why: { plannedKind: 'scam', boosted: false },
        },
        app.state,
      ),
    ).toBeUndefined();
  });
  it('re-opens a past variant from its key for the replay screen', () => {
    const scenario = s01();
    const again = resolveVariantKey(content, scenario.variantKey);
    expect(again).toEqual(scenario);
    expect(resolveVariantKey(content, 'S01-bank-code#address=99,org=0')).toBeUndefined();
    expect(resolveVariantKey(content, 'NOPE#-')).toBeUndefined();
    expect(resolveVariantKey(content, 'garbage')).toBeUndefined();
  });
  it('build the result card the player shares', async () => {
    await app.setupProfile({ addressTerm: 'Paati', playerName: 'Meenakshi' });
    const scenario = s01();
    const { attempt } = await app.recordCall({
      ended: playCall(scenario, { type: 'HANG_UP', tMs: justAfterFlag(scenario) }),
      scenario,
      scored: true,
    });
    const card = resultCardFor(app.state, attempt, scenario.summary);
    expect(card).toMatchObject({
      v: 1,
      t: 'result',
      name: 'Meenakshi',
      date: '2026-10-20',
      title: 'a fake bank call',
      outcome: 'sharp',
      tAction: justAfterFlag(scenario),
      streak: 1,
      rate30: 1,
    });
    expect(card?.tAsk).toBe(attempt.tAskMs);
  });
});

describe('loading content (same origin only)', () => {
  const json = (body: unknown, ok = true, status = 200) =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

  it('loads the library and the audio manifest, validating both', async () => {
    const calls: string[] = [];
    const fetchJson: FetchLike = (url) => {
      calls.push(url);
      return url.endsWith('library.json') ? json(realLibrary()) : json(realManifest());
    };
    const c = await loadContent(fetchJson);
    expect(calls).toEqual(['/scenarios/library.json', '/audio/audio-manifest.json']);
    expect(c.library.templates).toHaveLength(20);
    expect(c.infos).toHaveLength(20);
    expect(Object.keys(c.manifest.clips).length).toBe(Object.keys(realManifest().clips).length);
    expect(calls.every((u) => u.startsWith('/'))).toBe(true); // never an absolute URL
  });
  it('still works without audio: lines fall back to Web Speech', async () => {
    const offline: FetchLike = (url) =>
      url.endsWith('library.json') ? json(realLibrary()) : Promise.reject(new Error('offline'));
    expect((await loadContent(offline)).manifest.clips).toEqual({});
    const damaged: FetchLike = (url) =>
      url.endsWith('library.json') ? json(realLibrary()) : json({ nonsense: true });
    expect((await loadContent(damaged)).manifest.clips).toEqual({});
    const missing: FetchLike = (url) =>
      url.endsWith('library.json') ? json(realLibrary()) : json({}, false, 404);
    expect((await loadContent(missing)).manifest.clips).toEqual({});
  });
  it('fails loudly when the library itself is missing or damaged', async () => {
    await expect(loadContent(() => json({}, false, 500))).rejects.toThrow(/500/);
    await expect(loadContent(() => json({ templates: 'no' }))).rejects.toThrow();
  });
  it('builds scheduler info for every template', () => {
    const c = buildContent(realLibrary());
    expect(c.infos.map((i) => i.id)).toEqual(c.library.templates.map((t) => t.id));
    expect(c.infos.find((i) => i.id === 'S01-bank-code')?.tactics).toContain('code-request');
  });
});

describe('error handling', () => {
  it('a failed write leaves state unchanged', async () => {
    await app.setupProfile({ addressTerm: 'Paati' });
    const spy = vi.spyOn(repo, 'putSettings').mockRejectedValueOnce(new Error('disk full'));
    await expect(app.updateSettings({ sound: false })).rejects.toThrow('disk full');
    expect(app.state.settings.sound).toBe(true);
    spy.mockRestore();
  });
});
