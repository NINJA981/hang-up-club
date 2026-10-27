/**
 * pnpm audio:check  (AC-F5-1, AC-F5-2; CI never renders)
 *
 * For every clip the expanded library references: both files exist, the
 * manifest holds an entry, the entry's `sha` equals the hash of the current
 * text, voice, engine and filter version, and the size budgets hold.
 * Fails on stale, missing or orphaned audio. Needs no TTS engine.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AudioManifestSchema } from '../src/domain/audio/manifest';
import {
  clipsForTemplate,
  resolveVariant,
  varDomains,
  variantCount,
  clipKey,
} from '../src/domain/scenario/expand';
import { allPaths } from '../src/domain/scenario/timeline';
import { ROOT, formatIssue, loadScenarios } from './lib/scenarios';
import { BUDGETS, FILTER_VERSION } from './lib/tts/filter';
import { clipSha } from './lib/tts/plan';

const AUDIO_DIR = join(ROOT, 'public', 'audio');
const MANIFEST = join(AUDIO_DIR, 'audio-manifest.json');

const { library, voices, issues } = loadScenarios();
if (issues.length) {
  for (const i of issues) console.error(formatIssue(i));
  process.exit(1);
}
if (!existsSync(MANIFEST)) {
  console.error('public/audio/audio-manifest.json is missing. Run: pnpm audio:render');
  process.exit(1);
}
const manifest = AudioManifestSchema.parse(JSON.parse(readFileSync(MANIFEST, 'utf8')));

const problems: string[] = [];
if (manifest.filterVersion !== FILTER_VERSION) {
  problems.push(
    `manifest filterVersion ${String(manifest.filterVersion)} != FILTER_VERSION ${String(FILTER_VERSION)}`,
  );
}

const needed = new Set<string>();
let opusBytes = 0;
let aacBytes = 0;
for (const t of library.templates) {
  for (const clip of clipsForTemplate(t, library.addressTerms)) {
    needed.add(clip.key);
    const entry = manifest.clips[clip.key];
    if (!entry) {
      problems.push(`missing clip ${clip.key}: ${t.id} "${clip.text.slice(0, 50)}"`);
      continue;
    }
    const def = voices[clip.voice];
    if (!def) {
      problems.push(`unknown voice ${clip.voice}`);
      continue;
    }
    if (entry.sha !== clipSha(clip, entry.engine, def))
      problems.push(`stale clip ${clip.key}: ${t.id} "${clip.text.slice(0, 50)}"`);
    for (const f of [entry.opus, entry.aac]) {
      if (!existsSync(join(AUDIO_DIR, f))) problems.push(`missing file ${f}`);
    }
  }
}
for (const key of Object.keys(manifest.clips))
  if (!needed.has(key)) problems.push(`orphan manifest entry ${key}`);

const used = new Set<string>(['audio-manifest.json', 'CREDITS.md']);
for (const key of needed) {
  const e = manifest.clips[key];
  if (!e) continue;
  used.add(e.opus).add(e.aac);
  opusBytes += existsSync(join(AUDIO_DIR, e.opus)) ? statSync(join(AUDIO_DIR, e.opus)).size : 0;
  aacBytes += existsSync(join(AUDIO_DIR, e.aac)) ? statSync(join(AUDIO_DIR, e.aac)).size : 0;
}
for (const b of Object.values(manifest.beds)) {
  used.add(b.opus).add(b.aac);
  opusBytes += existsSync(join(AUDIO_DIR, b.opus)) ? statSync(join(AUDIO_DIR, b.opus)).size : 0;
  aacBytes += existsSync(join(AUDIO_DIR, b.aac)) ? statSync(join(AUDIO_DIR, b.aac)).size : 0;
}
for (const name of readdirSync(AUDIO_DIR)) if (!used.has(name)) problems.push(`orphan file ${name}`);

if (opusBytes > BUDGETS.opusTotalBytes)
  problems.push(`opus library ${String(opusBytes)} B exceeds ${String(BUDGETS.opusTotalBytes)} B`);
if (aacBytes > BUDGETS.aacTotalBytes)
  problems.push(`aac library ${String(aacBytes)} B exceeds ${String(BUDGETS.aacTotalBytes)} B`);

// Biggest single call path (voice clips only), over a bounded sample of variants.
let worst = { bytes: 0, id: '' };
for (const t of library.templates) {
  const n = variantCount(varDomains(t, library.addressTerms));
  const step = Math.max(1, Math.floor(n / 24));
  for (let v = 0; v < n; v += step) {
    const r = resolveVariant(t, library.addressTerms, v);
    for (const path of allPaths(r.lines)) {
      const byId = new Map(r.lines.map((l) => [l.id, l]));
      let bytes = 0;
      for (const id of path) {
        const l = byId.get(id);
        const e = l ? manifest.clips[clipKey(l.voice, l.text)] : undefined;
        if (e && existsSync(join(AUDIO_DIR, e.opus))) bytes += statSync(join(AUDIO_DIR, e.opus)).size;
      }
      if (bytes > worst.bytes) worst = { bytes, id: r.variantKey };
    }
  }
}
if (worst.bytes > BUDGETS.perCallOpusBytes)
  problems.push(
    `call path ${worst.id} is ${String(worst.bytes)} B (max ${String(BUDGETS.perCallOpusBytes)})`,
  );

if (problems.length) {
  for (const p of problems.slice(0, 60)) console.error(p);
  if (problems.length > 60) console.error(`... and ${String(problems.length - 60)} more`);
  console.error(`\n${String(problems.length)} problem(s). Run: pnpm audio:render`);
  process.exit(1);
}
console.log(
  `audio OK: ${String(needed.size)} clips, opus ${String(Math.round(opusBytes / 1024))} KB, aac ${String(Math.round(aacBytes / 1024))} KB, largest call path ${String(Math.round(worst.bytes / 1024))} KB`,
);
