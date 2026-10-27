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

/** A missing or damaged manifest is not fatal: every line then falls back to Web Speech. Never rejects. */
async function loadManifest(fetchJson: FetchLike): Promise<AudioManifest> {
  try {
    const res = await fetchJson('/audio/audio-manifest.json');
    return res.ok ? AudioManifestSchema.parse(await res.json()) : EMPTY_MANIFEST;
  } catch {
    // Offline without a cached manifest, or a damaged one.
    return EMPTY_MANIFEST;
  }
}

/**
 * Same-origin only (SPEC §10.2). The two files are requested together: fetched one after the other
 * the manifest added a whole round trip to the first paint of the Welcome screen (AC-X-4, LCP).
 */
export async function loadContent(fetchJson: FetchLike): Promise<Content> {
  const libraryRequest = fetchJson('/scenarios/library.json');
  const manifestRequest = loadManifest(fetchJson);
  const libRes = await libraryRequest;
  if (!libRes.ok) throw new Error(`Could not load the call library (${String(libRes.status)})`);
  const library = LibrarySchema.parse(await libRes.json());
  return buildContent(library, await manifestRequest);
}
