/**
 * Regenerates src/demo/*.json and public/audio/demo/* from the app's compiled
 * scenario library and rendered audio. READ-ONLY on the repo root.
 *
 * Run from site/:  ../node_modules/.bin/tsx scripts/sync-demo.mts
 * (uses the root package's tsx and its domain code, so durations and clip
 * identities are exactly the app's, not a copy that can drift).
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const src = (p: string) => pathToFileURL(resolve(root, 'src', p)).href;

const { resolveWithVars, clipKey } = await import(src('domain/scenario/expand.ts'));
const { planTimeline, markers } = await import(src('domain/scenario/timeline.ts'));
const { TACTIC_LABELS } = await import(src('domain/scenario/schema.ts'));

const lib = JSON.parse(readFileSync(resolve(root, 'public/scenarios/library.json'), 'utf8'));
const man = JSON.parse(readFileSync(resolve(root, 'public/audio/audio-manifest.json'), 'utf8'));
mkdirSync(resolve(here, '../public/audio/demo'), { recursive: true });

interface Clip {
  opus: string;
  aac: string;
  durationMs: number;
}
let copied = 0;
let bytesOpus = 0;
let bytesAac = 0;
function clipOf(voice: string, text: string): Clip {
  const c: Clip | undefined = man.clips[clipKey(voice, text)];
  if (!c) throw new Error(`No rendered clip for: ${text}`);
  for (const f of [c.opus, c.aac]) {
    copyFileSync(resolve(root, 'public/audio', f), resolve(here, '../public/audio/demo', f));
    copied++;
  }
  bytesOpus += statSync(resolve(root, 'public/audio', c.opus)).size;
  bytesAac += statSync(resolve(root, 'public/audio', c.aac)).size;
  return c;
}

function build(id: string, vars: Record<string, string>, withClips: boolean) {
  const t = lib.templates.find((x: { id: string }) => x.id === id);
  const r = resolveWithVars(t, vars, id);
  const dur = (l: { voice: string; text: string }) =>
    man.clips[clipKey(l.voice, l.text)].durationMs as number;
  const plan = planTimeline(r.lines, dur);
  const m = markers(plan);
  const lines = r.lines.map((l: any) => {
    const entry: Record<string, unknown> = {
      id: l.id,
      text: l.text,
      speaker: l.speaker,
      durationMs: dur(l),
      pauseAfterMs: l.pauseAfterMs ?? 450,
      cueAt: l.cueAt ?? 0.5,
      flag: l.flag === true,
      ask: l.ask === true,
      tactics: l.tactics ?? [],
      replies: l.replies ?? [],
      next: l.next ?? null,
    };
    if (withClips) {
      const c = clipOf(l.voice, l.text);
      entry.opus = c.opus;
      entry.aac = c.aac;
    }
    return entry;
  });
  const ivr = r.callback.ivr.map((l: any) => {
    const entry: Record<string, unknown> = {
      id: l.id,
      text: l.say,
      durationMs: dur({ voice: r.callback.voice, text: l.say }),
    };
    if (withClips) {
      const c = clipOf(r.callback.voice, l.say);
      entry.opus = c.opus;
      entry.aac = c.aac;
    }
    return entry;
  });
  return {
    id,
    kind: r.kind,
    caller: { display: r.caller.display, number: r.caller.number },
    lines,
    callback: {
      label: r.callback.label,
      trustedSource: r.callback.trustedSource,
      number: r.callback.number,
      ivr,
    },
    advice: r.advice,
    markers: { tFlagMs: m.tFlagMs ?? null, tAskMs: m.tAskMs ?? null, tEndMs: m.tEndMs },
    who: r.who ?? null,
    plan: plan.map((p: any) => ({ id: p.id, startMs: p.startMs, endMs: p.endMs, cueMs: p.cueMs })),
  };
}

const s01 = build('S01-bank-code', { org: 'First Wrenfield Bank', address: 'Paati' }, true);
const l01 = build('L01-pharmacy-refill', { time: 'six tonight', address: 'Paati' }, false);
writeFileSync(
  resolve(here, '../src/demo/scenarios.json'),
  JSON.stringify({ s01, l01, tacticLabels: TACTIC_LABELS }, null, 2) + '\n',
);
console.log(
  `clips copied: ${copied}  opus ${(bytesOpus / 1024).toFixed(1)} KB  aac ${(bytesAac / 1024).toFixed(1)} KB`,
);
console.log('S01 markers', s01.markers);
