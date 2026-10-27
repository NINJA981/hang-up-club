import { AudioManifestSchema, EMPTY_MANIFEST, type AudioManifest } from '../domain/audio/manifest';
import { templateTactics } from '../domain/scenario/library';
import { varDomains } from '../domain/scenario/expand';
import { LibrarySchema, type Library, type ScenarioTemplate } from '../domain/scenario/schema';
import type { TemplateInfo } from '../domain/schedule/daily';

/** The compiled content the app runs on: scenarios plus the rendered-audio manifest. */
export interface Content {
  library: Library;
  manifest: AudioManifest;
  infos: TemplateInfo[];
  byId: ReadonlyMap<string, ScenarioTemplate>;
}

export function buildContent(library: Library, manifest: AudioManifest = EMPTY_MANIFEST): Content {
  return {
    library,
    manifest,
    infos: library.templates.map((t) => ({
      id: t.id,
      kind: t.kind,
      group: t.group,
      tactics: templateTactics(t),
      domains: varDomains(t, library.addressTerms),
    })),
    byId: new Map(library.templates.map((t) => [t.id, t])),
  };
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Same-origin only (SPEC §10.2). A missing manifest is not fatal: lines fall back to Web Speech. */
export async function loadContent(fetchJson: FetchLike): Promise<Content> {
  const libRes = await fetchJson('/scenarios/library.json');
  if (!libRes.ok) throw new Error(`Could not load the call library (${String(libRes.status)})`);
  const library = LibrarySchema.parse(await libRes.json());
  let manifest: AudioManifest = EMPTY_MANIFEST;
  try {
    const res = await fetchJson('/audio/audio-manifest.json');
    if (res.ok) manifest = AudioManifestSchema.parse(await res.json());
  } catch {
    // Offline without a cached manifest, or a damaged one: every line then falls back to Web Speech.
    manifest = EMPTY_MANIFEST;
  }
  return buildContent(library, manifest);
}
