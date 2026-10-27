/**
 * pnpm audio:render  (ADR §4.1)
 *
 * Expands every template into its unique clips, renders the ones whose
 * manifest `sha` is stale with the first engine that can speak each voice
 * (Piper, Kitten, then Windows SAPI), band-passes to telephone quality and
 * encodes Opus/WebM + AAC/M4A into public/audio/. Writes audio-manifest.json.
 *
 * Flags: --force  re-render everything     --dry-run  print the plan only
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AudioManifestSchema, type AudioManifest } from '../../src/domain/audio/manifest';
import { clipsForTemplate, type ClipSpec } from '../../src/domain/scenario/expand';
import { hash53Hex } from '../../src/domain/schedule/rng';
import { ROOT, formatIssue, loadScenarios } from '../lib/scenarios';
import {
  ffmpeg,
  kittenEngine,
  piperEngine,
  probeDurationMs,
  sapiEngine,
  type SynthJob,
  type TtsEngine,
} from '../lib/tts/engines';
import { FILTER_VERSION, aacArgs, filterArgs, opusArgs } from '../lib/tts/filter';
import { planRender, type EngineId } from '../lib/tts/plan';
import { renderBeds } from './beds';

const AUDIO_DIR = join(ROOT, 'public', 'audio');
const MANIFEST = join(AUDIO_DIR, 'audio-manifest.json');
const CACHE = join(ROOT, '.tts-cache');
const args = new Set(process.argv.slice(2));

const { library, voices, issues } = loadScenarios();
if (issues.length) {
  for (const i of issues) console.error(formatIssue(i));
  process.exit(1);
}

const seen = new Map<string, ClipSpec>();
for (const t of library.templates) {
  for (const c of clipsForTemplate(t, library.addressTerms)) seen.set(c.key, c);
}
const clips = [...seen.values()].sort((a, b) => (a.key < b.key ? -1 : 1));

const engines: TtsEngine[] = [piperEngine(join(CACHE, 'piper')), kittenEngine(), sapiEngine()];
const byId = new Map<EngineId, TtsEngine>(engines.map((e) => [e.id, e]));

const previous: AudioManifest | undefined = existsSync(MANIFEST)
  ? AudioManifestSchema.parse(JSON.parse(readFileSync(MANIFEST, 'utf8')))
  : undefined;

const plan = planRender(
  clips,
  voices,
  (def) => new Set(engines.filter((e) => e.canSpeak(def)).map((e) => e.id)),
  args.has('--force') ? undefined : previous,
  (file) => existsSync(join(AUDIO_DIR, file)),
);

const stale = plan.items.filter((i) => !i.fresh);
console.log(`${String(clips.length)} unique clips, ${String(stale.length)} to render`);
if (plan.unvoiced.length) {
  console.error(`No engine can speak: ${plan.unvoiced.join(', ')}`);
  process.exit(1);
}
if (args.has('--dry-run')) process.exit(0);

mkdirSync(AUDIO_DIR, { recursive: true });
mkdirSync(join(CACHE, 'wav'), { recursive: true });

const live = new Set(clips.map((c) => c.key));
const manifestClips: AudioManifest['clips'] = Object.fromEntries(
  Object.entries(args.has('--force') ? {} : (previous?.clips ?? {})).filter(([key]) => live.has(key)),
);

// Render per engine in one batch each (SAPI starts one PowerShell for all clips).
for (const engine of engines) {
  const mine = stale.filter((i) => i.engine === engine.id);
  if (!mine.length) continue;
  console.log(`  ${engine.id}: ${String(mine.length)} clips`);
  const jobs: SynthJob[] = mine.map((i) => {
    const def = voices[i.clip.voice];
    if (!def) throw new Error(`Unknown voice ${i.clip.voice}`);
    return {
      text: i.clip.text,
      voiceId: i.clip.voice,
      def,
      out: join(CACHE, 'wav', `${i.clip.key}.raw.wav`),
    };
  });
  byId.get(engine.id)?.synthesize(jobs, CACHE);
  mine.forEach((item, n) => {
    const job = jobs[n];
    const def = voices[item.clip.voice];
    if (!job || !def) return;
    const filtered = join(CACHE, 'wav', `${item.clip.key}.wav`);
    const opus = `${item.clip.key}.webm`;
    const aac = `${item.clip.key}.m4a`;
    ffmpeg(filterArgs(job.out, filtered, def.pitch !== undefined ? { pitch: def.pitch } : {}));
    ffmpeg(opusArgs(filtered, join(AUDIO_DIR, opus)));
    ffmpeg(aacArgs(filtered, join(AUDIO_DIR, aac)));
    manifestClips[item.clip.key] = {
      opus,
      aac,
      durationMs: probeDurationMs(join(AUDIO_DIR, opus)),
      sha: item.sha,
      engine: item.engine,
      voice: item.clip.voice,
    };
    rmSync(job.out, { force: true });
    rmSync(filtered, { force: true });
  });
}

const beds = renderBeds({
  voices,
  engines,
  audioDir: AUDIO_DIR,
  cacheDir: CACHE,
  force: args.has('--force'),
  previous,
});

const version = hash53Hex(
  [...Object.entries(manifestClips), ...Object.entries(beds)]
    .map(([k, v]) => `${k}:${v.sha}`)
    .sort()
    .join('|') + String(FILTER_VERSION),
);
const manifest: AudioManifest = AudioManifestSchema.parse({
  version,
  filterVersion: FILTER_VERSION,
  clips: sortKeys(manifestClips),
  beds: sortKeys(beds),
});
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

// Orphans: files no manifest entry points at.
const keep = new Set<string>(['audio-manifest.json', 'CREDITS.md']);
for (const c of Object.values(manifest.clips)) keep.add(c.opus).add(c.aac);
for (const b of Object.values(manifest.beds)) keep.add(b.opus).add(b.aac);
for (const name of readdirSync(AUDIO_DIR)) {
  if (!keep.has(name)) rmSync(join(AUDIO_DIR, name), { force: true });
}

function totalBytes(pick: (c: { opus: string; aac: string }) => string): number {
  return Object.values(manifest.clips).reduce((n, c) => n + statSync(join(AUDIO_DIR, pick(c))).size, 0);
}
console.log(
  `Wrote ${MANIFEST}: ${String(Object.keys(manifest.clips).length)} clips, opus ${String(Math.round(totalBytes((c) => c.opus) / 1024))} KB, aac ${String(Math.round(totalBytes((c) => c.aac) / 1024))} KB, version ${version}`,
);

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
}
