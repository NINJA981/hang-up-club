import { createHash } from 'node:crypto';
import type { AudioManifest } from '../../../src/domain/audio/manifest';
import type { ClipSpec } from '../../../src/domain/scenario/expand';
import type { VoiceDef } from '../../../src/domain/scenario/schema';
import { FILTER_VERSION } from './filter';

export type EngineId = 'piper' | 'kitten' | 'sapi';
/** Engines in priority order (ADR §4.1): neural first, OS voice as the always-there fallback. */
export const ENGINE_ORDER: readonly EngineId[] = ['piper', 'kitten', 'sapi'];

/** The part of a voice definition that changes what the audio sounds like. */
export function voiceSignature(def: VoiceDef, engine: EngineId): string {
  switch (engine) {
    case 'piper':
      return JSON.stringify(['piper', def.piper ?? null, def.pitch ?? 1]);
    case 'kitten':
      return JSON.stringify(['kitten', def.kitten ?? null, def.pitch ?? 1]);
    case 'sapi':
      return JSON.stringify(['sapi', def.sapi ?? null, def.sapiRate ?? 0, def.pitch ?? 1]);
  }
}

/** SPEC AC-F5-1: sha256 of text, voice, engine and filter version (plus the voice's engine settings). */
export function clipSha(clip: Pick<ClipSpec, 'text' | 'voice'>, engine: EngineId, def: VoiceDef): string {
  return createHash('sha256')
    .update([clip.text, clip.voice, engine, String(FILTER_VERSION), voiceSignature(def, engine)].join('␟'))
    .digest('hex');
}

/** Does this engine have what it needs to speak this voice? */
export function engineSupportsVoice(engine: EngineId, def: VoiceDef): boolean {
  switch (engine) {
    case 'piper':
      return def.piper !== undefined;
    case 'kitten':
      return def.kitten !== undefined;
    case 'sapi':
      return def.sapi !== undefined;
  }
}

/** One engine per voice, so a voice never changes timbre mid-call (ADR §4.1 step 3). */
export function chooseEngine(def: VoiceDef, available: ReadonlySet<EngineId>): EngineId | undefined {
  return ENGINE_ORDER.find((e) => available.has(e) && engineSupportsVoice(e, def));
}

export interface RenderItem {
  clip: ClipSpec;
  engine: EngineId;
  sha: string;
  /** True when the manifest already holds this exact sha and both files exist. */
  fresh: boolean;
}

export interface RenderPlan {
  items: RenderItem[];
  /** Voices no available engine can speak. */
  unvoiced: string[];
}

export function planRender(
  clips: readonly ClipSpec[],
  voices: Readonly<Record<string, VoiceDef>>,
  available: (def: VoiceDef) => ReadonlySet<EngineId>,
  manifest: Pick<AudioManifest, 'clips'> | undefined,
  filesExist: (file: string) => boolean,
): RenderPlan {
  const items: RenderItem[] = [];
  const unvoiced = new Set<string>();
  for (const clip of clips) {
    const def = voices[clip.voice];
    const engine = def ? chooseEngine(def, available(def)) : undefined;
    if (!def || !engine) {
      unvoiced.add(clip.voice);
      continue;
    }
    const sha = clipSha(clip, engine, def);
    const prev = manifest?.clips[clip.key];
    const fresh = prev?.sha === sha && filesExist(prev.opus) && filesExist(prev.aac);
    items.push({ clip, engine, sha, fresh });
  }
  return { items, unvoiced: [...unvoiced].sort() };
}
