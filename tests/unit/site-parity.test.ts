import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AudioManifestSchema, durationOfFrom } from '../../src/domain/audio/manifest';
import { formatClock, formatSeconds } from '../../src/domain/format/format';
import { outcomeCopy as appCopy } from '../../src/domain/result/copy';
import { resolveWithVars } from '../../src/domain/scenario/expand';
import { LibrarySchema } from '../../src/domain/scenario/schema';
import {
  markers as appMarkers,
  planTimeline as appPlan,
  replanAfterReply as appReplan,
} from '../../src/domain/scenario/timeline';
import { score as appScore, type Action } from '../../src/domain/scoring/score';
import * as site from '../../site/src/call/logic';

/**
 * The landing page (site/) plays a real S01 call in its hero, with its own small copy of the app's
 * timeline, scoring and result copy (site/src/call/logic.ts) so it ships 9 KB of JS instead of the app.
 * A copy can drift. These are the site's unit tests: they hold its logic and its generated demo data
 * (site/src/demo/scenarios.json, from site/scripts/sync-demo.mts) to the app's domain code, so the
 * landing page cannot tell a different story from the product.
 */

const root = join(import.meta.dirname, '..', '..');
const library = LibrarySchema.parse(
  JSON.parse(readFileSync(join(root, 'public', 'scenarios', 'library.json'), 'utf8')),
);
const manifest = AudioManifestSchema.parse(
  JSON.parse(readFileSync(join(root, 'public', 'audio', 'audio-manifest.json'), 'utf8')),
);
const template = library.templates.find((t) => t.id === 'S01-bank-code');
if (!template) throw new Error('S01-bank-code is missing from the library');
// The same variant site/scripts/sync-demo.mts renders.
const s01 = resolveWithVars(template, { org: 'First Wrenfield Bank', address: 'Paati' }, 'S01-bank-code');
const durationOf = durationOfFrom(manifest);
const appPlanned = appPlan(s01.lines, durationOf);
const app = appMarkers(appPlanned);

/** The site writes curly apostrophes where the app's copy has straight ones; the words must match. */
const plain = (s: string): string => s.replaceAll('’', "'");

describe('site demo data is current with the app library', () => {
  it('has the same caller, lines, durations, flags, ask and replies as the app plays for S01', () => {
    expect(site.S01.caller).toEqual({ display: s01.caller.display, number: s01.caller.number });
    expect(site.S01.lines.map((l) => l.id)).toEqual(s01.lines.map((l) => l.id));
    for (const line of s01.lines) {
      const demo = site.S01.lines.find((l) => l.id === line.id);
      expect(demo, line.id).toBeDefined();
      expect(demo?.text, line.id).toBe(line.text);
      expect(demo?.durationMs, `${line.id} duration (re-run sync-demo after re-rendering audio)`).toBe(
        Math.round(durationOf(line)),
      );
      expect(demo?.flag, line.id).toBe(line.flag === true);
      expect(demo?.ask, line.id).toBe(line.ask === true);
      expect(demo?.replies, line.id).toEqual(line.replies ?? []);
    }
    expect(site.S01.callback.label).toBe(s01.callback.label);
    expect(site.S01.callback.number).toBe(s01.callback.number);
    expect(site.S01.advice).toBe(s01.advice);
  });

  it('carries the markers the app computes', () => {
    expect(site.S01.markers).toEqual({ tFlagMs: app.tFlagMs, tAskMs: app.tAskMs, tEndMs: app.tEndMs });
  });
});

describe('site timeline matches the app timeline', () => {
  it('plans the default path to the same millisecond', () => {
    const plan = site.planTimeline(site.S01.lines);
    expect(plan.map((p) => [p.line.id, p.startMs, p.endMs, p.cueMs])).toEqual(
      appPlanned.map((l) => [l.id, l.startMs, l.endMs, l.cueMs]),
    );
    expect(site.markers(plan)).toEqual(site.S01.markers);
  });

  it('re-plans a reply tap the same way (during the line and after it ended)', () => {
    const intro = appPlanned.find((l) => l.replies.length > 0);
    if (!intro) throw new Error('S01 has no line with replies');
    for (const tap of [intro.startMs + 500, intro.endMs + 100]) {
      for (const [i] of intro.replies.entries()) {
        const a = appReplan(appPlanned, s01.lines, durationOf, intro.id, i, tap);
        const s = site.replan(site.S01.lines, site.planTimeline(site.S01.lines), intro.id, i, tap);
        expect(
          s.map((p) => [p.line.id, p.startMs, p.endMs]),
          `reply ${String(i)} at ${String(tap)}`,
        ).toEqual(a.map((l) => [l.id, l.startMs, l.endMs]));
      }
    }
  });
});

describe('site scoring and result copy match the app (SPEC 7.2)', () => {
  const m = site.S01.markers;
  const times = [
    0,
    500,
    m.tFlagMs - 1,
    m.tFlagMs,
    m.tFlagMs + 1,
    m.tAskMs - 1,
    m.tAskMs,
    m.tAskMs + 4_000,
    m.tAskMs + 10_000,
    m.tEndMs - 1,
    m.tEndMs,
    m.tEndMs + 1_000,
  ];
  const actions: Action[] = ['hangup', 'callback', 'none'];

  it.each(actions)('"%s" gets the same outcome and moment at every boundary', (action) => {
    for (const t of times) {
      const a = appScore({
        kind: 'scam',
        action,
        tActionMs: t,
        tFlagMs: m.tFlagMs,
        tAskMs: m.tAskMs,
        tEndMs: m.tEndMs,
      });
      expect(site.score(action, t, m), `${action} at ${String(t)} ms`).toEqual({
        outcome: a.outcome,
        moment: a.moment,
      });
    }
  });

  it('says the same headline and subline as the result screen', () => {
    for (const action of actions) {
      for (const t of times) {
        const { outcome } = site.score(action, t, m);
        const s = site.outcomeCopy(outcome, t, m);
        const a = appCopy({
          kind: 'scam',
          outcome,
          tActionMs: t,
          tAskMs: m.tAskMs,
          trustedSource: s01.callback.trustedSource,
          ...(s01.askFor !== undefined ? { askFor: s01.askFor } : {}),
        });
        expect(plain(s.headline), `${outcome} at ${String(t)}`).toBe(plain(a.headline));
        expect(plain(s.subline), `${outcome} at ${String(t)}`).toBe(plain(a.subline));
        expect(s.icon).toBe(a.icon);
      }
    }
  });

  it('formats the call clock and the "4 s after" durations like the app', () => {
    for (const ms of [0, 999, 1000, 13_400, 59_999, 60_000, 61_500, 120_000, 600_000, -5]) {
      expect(site.clock(ms), String(ms)).toBe(formatClock(ms));
      expect(site.seconds(ms), String(ms)).toBe(formatSeconds(ms));
    }
  });
});
