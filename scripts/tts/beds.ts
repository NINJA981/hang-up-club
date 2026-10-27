import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parse } from 'yaml';
import type { AudioManifest } from '../../src/domain/audio/manifest';
import { randInt, rngFrom } from '../../src/domain/schedule/rng';
import type { VoiceDef } from '../../src/domain/scenario/schema';
import { SCENARIO_DIR } from '../lib/scenarios';
import { ffmpeg, probeDurationMs, type TtsEngine } from '../lib/tts/engines';
import { FILTER_VERSION, aacArgs, filterArgs, opusArgs } from '../lib/tts/filter';
import { voiceSignature } from '../lib/tts/plan';

/**
 * Ambience beds (ADR §4.1 step 5): layered TTS murmur at -28 dB plus pink
 * noise, band-passed like the voices, 20 s, looped at runtime under the call.
 * No third-party samples.
 */

const BedDefSchema = z.strictObject({
  label: z.string(),
  speakers: z.array(z.string()).min(1),
  fillers: z.array(z.string()).min(1),
  noiseDb: z.number().max(-30).min(-70),
});
const BedsSchema = z.record(z.string(), BedDefSchema);

export const BED_SECONDS = 20;
const MURMUR_DB = -28;

interface Options {
  voices: Record<string, VoiceDef>;
  engines: readonly TtsEngine[];
  audioDir: string;
  cacheDir: string;
  force: boolean;
  previous: AudioManifest | undefined;
}

export function renderBeds(o: Options): AudioManifest['beds'] {
  const defs = BedsSchema.parse(parse(readFileSync(join(SCENARIO_DIR, 'shared', 'ambience.yaml'), 'utf8')));
  const out: AudioManifest['beds'] = {};
  mkdirSync(join(o.cacheDir, 'beds'), { recursive: true });

  for (const [id, def] of Object.entries(defs)) {
    // Pick the engine per speaker; the bed's sha covers every choice.
    const speakers = def.speakers.map((s) => {
      const vd = o.voices[s];
      const engine = vd ? o.engines.find((e) => e.canSpeak(vd)) : undefined;
      if (!vd || !engine) throw new Error(`No engine can speak bed voice ${s}`);
      return { id: s, vd, engine };
    });
    const sha = createHash('sha256')
      .update(
        JSON.stringify([
          id,
          def,
          String(FILTER_VERSION),
          speakers.map((s) => voiceSignature(s.vd, s.engine.id)),
        ]),
      )
      .digest('hex');
    const prev = o.previous?.beds[id];
    if (!o.force && prev?.sha === sha) {
      out[id] = prev;
      continue;
    }

    const rng = rngFrom('bed', id);
    const inputs: { file: string; at: number }[] = [];
    def.fillers.forEach((text, n) => {
      const sp = speakers[n % speakers.length];
      if (!sp) return;
      const file = join(o.cacheDir, 'beds', `${id}-${String(n)}.raw.wav`);
      sp.engine.synthesize([{ text, voiceId: sp.id, def: sp.vd, out: file }], o.cacheDir);
      inputs.push({ file, at: randInt(rng, (BED_SECONDS - 5) * 1000) });
    });

    const noiseAmp = 10 ** (def.noiseDb / 20);
    const args = ['-y', '-v', 'error'];
    for (const i of inputs) args.push('-i', i.file);
    args.push(
      '-f',
      'lavfi',
      '-t',
      String(BED_SECONDS),
      '-i',
      `anoisesrc=color=pink:amplitude=${noiseAmp.toFixed(5)}:sample_rate=22050`,
    );
    const murmur = inputs.map(
      (i, n) =>
        `[${String(n)}:a]volume=${String(MURMUR_DB)}dB,adelay=${String(i.at)}|${String(i.at)}[m${String(n)}]`,
    );
    const labels = inputs.map((_, n) => `[m${String(n)}]`).join('');
    const noiseIdx = String(inputs.length);
    const graph = [
      ...murmur,
      `${labels}[${noiseIdx}:a]amix=inputs=${String(inputs.length + 1)}:normalize=0:duration=longest,atrim=0:${String(BED_SECONDS)},afade=t=in:d=0.15,afade=t=out:st=${String(BED_SECONDS - 0.15)}:d=0.15[mix]`,
    ].join(';');
    const raw = join(o.cacheDir, 'beds', `${id}.raw.wav`);
    args.push('-filter_complex', graph, '-map', '[mix]', '-ac', '1', '-ar', '22050', raw);
    ffmpeg(args);

    const filtered = join(o.cacheDir, 'beds', `${id}.wav`);
    ffmpeg(filterArgs(raw, filtered));
    const opus = `bed-${id}.webm`;
    const aac = `bed-${id}.m4a`;
    ffmpeg(opusArgs(filtered, join(o.audioDir, opus)));
    ffmpeg(aacArgs(filtered, join(o.audioDir, aac)));
    out[id] = { opus, aac, durationMs: probeDurationMs(join(o.audioDir, opus)), sha };
    for (const f of [raw, filtered, ...inputs.map((i) => i.file)]) rmSync(f, { force: true });
  }
  return out;
}
