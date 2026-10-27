import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AudioManifestSchema, EMPTY_MANIFEST, type AudioManifest } from '../../../src/domain/audio/manifest';
import { LibrarySchema, type Library } from '../../../src/domain/scenario/schema';
import { buildContent, type Content } from '../../../src/state/library';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/** The production library, compiled by `pnpm scenarios:build` (committed). */
export function realLibrary(): Library {
  return LibrarySchema.parse(
    JSON.parse(readFileSync(join(ROOT, 'public', 'scenarios', 'library.json'), 'utf8')),
  );
}

/** The rendered-audio manifest, or an empty one when audio has not been rendered. */
export function realManifest(): AudioManifest {
  try {
    return AudioManifestSchema.parse(
      JSON.parse(readFileSync(join(ROOT, 'public', 'audio', 'audio-manifest.json'), 'utf8')),
    );
  } catch {
    return EMPTY_MANIFEST;
  }
}

export function realContent(withAudio = false): Content {
  return buildContent(realLibrary(), withAudio ? realManifest() : EMPTY_MANIFEST);
}
