import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clipsForTemplate } from '../../src/domain/scenario/expand';
import {
  findBadPhones,
  findNameHits,
  listScannable,
  parseAllowList,
  parseDenyList,
  type DenyEntry,
} from '../../scripts/lib/names';
import {
  BUDGETS,
  FILTER_VERSION,
  aacArgs,
  filterArgs,
  filterChain,
  opusArgs,
} from '../../scripts/lib/tts/filter';
import {
  ENGINE_ORDER,
  chooseEngine,
  clipSha,
  engineSupportsVoice,
  planRender,
  voiceSignature,
  type EngineId,
} from '../../scripts/lib/tts/plan';
import { loadScenarios } from '../../scripts/lib/scenarios';
import { ffmpeg, installedSapiVoices, probeDurationMs, sapiEngine } from '../../scripts/lib/tts/engines';
import type { VoiceDef } from '../../src/domain/scenario/schema';
import { realLibrary } from './helpers/content';
import { FIXTURES, MINI_SCAM, MINI_TERMS } from './helpers/fixtures';

const REPO = join(import.meta.dirname, '..', '..');
const denyDir = join(REPO, 'scripts', 'deny-list');
const entries: DenyEntry[] = readdirSync(denyDir)
  .filter((f) => f.endsWith('.txt') && f !== 'allow-citations.txt')
  .flatMap((f) => parseDenyList(readFileSync(join(denyDir, f), 'utf8'), f));
const lines = (file: string): string[] =>
  readFileSync(join(FIXTURES, 'names', file), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'));

describe('fictional-name deny-list (AC-F3-5)', () => {
  it('flags every real-institution sample', () => {
    for (const text of lines('real.txt')) {
      expect(findNameHits(text, entries).length, text).toBeGreaterThan(0);
    }
  });
  it('allows every coined name and ordinary look-alike word', () => {
    for (const text of lines('fictional.txt')) {
      expect(findNameHits(text, entries), text).toEqual([]);
    }
  });
  it('matches whole words only', () => {
    expect(findNameHits('She was a supper of applesauce.', entries)).toEqual([]);
    expect(findNameHits('Order from Amazon today', entries).map((h) => h.term)).toEqual(['Amazon']);
    expect(findNameHits('Amazonian rainforest', entries)).toEqual([]);
  });
  it('is case-insensitive by default and case-sensitive for = terms', () => {
    expect(findNameHits('call wells fargo', entries).length).toBe(1);
    expect(findNameHits('We will chase this up', entries)).toEqual([]);
    expect(findNameHits('Chase Bank says hello', entries).length).toBeGreaterThan(0);
    expect(findNameHits('the ups and downs', entries)).toEqual([]);
    expect(findNameHits('a UPS truck', entries).length).toBe(1);
  });
  it('matches curly and straight apostrophes in names', () => {
    expect(findNameHits("Lowe's is open", entries).length).toBe(1);
    expect(findNameHits('Lowe’s is open', entries).length).toBe(1);
    expect(findNameHits("Sam's Club is near", entries).length).toBe(1);
  });
  it('reports line numbers', () => {
    expect(findNameHits('fine\nfine\nOpen Zelle now', entries)[0]).toMatchObject({
      line: 3,
      term: 'Zelle',
      list: 'banks.txt',
    });
  });
  it('lets a citation through only in the file that cites it', () => {
    const allow = parseAllowList(readFileSync(join(denyDir, 'allow-citations.txt'), 'utf8'));
    expect(allow).toEqual([
      { path: 'scenarios/SOURCES.md', term: 'Federal Trade Commission' },
      { path: 'public/audio/CREDITS.md', term: 'Microsoft' },
      { path: 'src/ui/sources.ts', term: 'Federal Trade Commission' },
      { path: 'site/index.html', term: 'Twitter' },
    ]);
    const text = 'Federal Trade Commission, Protecting Older Consumers';
    expect(findNameHits(text, entries, new Set(['Federal Trade Commission']))).toEqual([]);
    expect(findNameHits(text, entries).length).toBe(1);
  });
  it('parses comments, blanks and the case marker', () => {
    expect(parseDenyList('# comment\n\n=Chase\n  Zelle  \n', 'x')).toEqual([
      { term: 'Chase', caseSensitive: true, list: 'x' },
      { term: 'Zelle', caseSensitive: false, list: 'x' },
    ]);
    expect(parseAllowList('# c\n\na/b.md|Term\nbroken line\n')).toEqual([{ path: 'a/b.md', term: 'Term' }]);
  });
  it('finds no real name anywhere in the production library', () => {
    const text = JSON.stringify(realLibrary(), null, 1);
    expect(findNameHits(text, entries)).toEqual([]);
  });
});

describe('phone numbers must sit in the fictional block', () => {
  it('accepts (NXX) 555-01xx and rejects everything else', () => {
    expect(findBadPhones('Call (614) 555-0148 now')).toEqual([]);
    expect(findBadPhones('(212) 555-0100 and (999) 555-0199')).toEqual([]);
    expect(findBadPhones('Call 614-555-0148 now').map((p) => p.value)).toEqual(['614-555-0148']);
    expect(findBadPhones('(614) 555-0248').map((p) => p.value)).toEqual(['(614) 555-0248']);
    expect(findBadPhones('(800) 123-4567')).toHaveLength(1);
    expect(findBadPhones('614.555.0148').map((p) => p.value)).toEqual(['614.555.0148']);
  });
  it('reports the line and ignores things that only look like numbers', () => {
    expect(findBadPhones('ok\n(614) 555-0248')[0]).toMatchObject({ line: 2 });
    expect(findBadPhones('version 2026-10-20 build 12345678')).toEqual([]);
    expect(findBadPhones('$1,200 and $850,000')).toEqual([]);
  });
  it('every number in the production library is fictional', () => {
    expect(findBadPhones(JSON.stringify(realLibrary(), null, 1))).toEqual([]);
  });
});

describe('TTS render planning (ADR 4.1)', () => {
  const zira: VoiceDef = { label: 'z', sapi: 'Microsoft Zira Desktop', piper: { model: 'm' }, kitten: 'k' };
  const sapiOnly: VoiceDef = { label: 's', sapi: 'Microsoft David Desktop' };
  const clip = { key: 'zira-calm-abc', voice: 'zira-calm', text: 'Hello there.' };

  it('tries Piper, then Kitten, then SAPI', () => {
    expect(ENGINE_ORDER).toEqual(['piper', 'kitten', 'sapi']);
    expect(chooseEngine(zira, new Set<EngineId>(['sapi', 'kitten', 'piper']))).toBe('piper');
    expect(chooseEngine(zira, new Set<EngineId>(['sapi', 'kitten']))).toBe('kitten');
    expect(chooseEngine(zira, new Set<EngineId>(['sapi']))).toBe('sapi');
    expect(chooseEngine(zira, new Set<EngineId>())).toBeUndefined();
  });
  it('skips an engine that has no setting for the voice', () => {
    expect(engineSupportsVoice('piper', sapiOnly)).toBe(false);
    expect(chooseEngine(sapiOnly, new Set<EngineId>(['piper', 'kitten', 'sapi']))).toBe('sapi');
  });
  it('hashes text, voice, engine and filter version, so any change makes a clip stale (AC-F5-1)', () => {
    const base = clipSha(clip, 'sapi', zira);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(clipSha(clip, 'sapi', zira)).toBe(base);
    expect(clipSha({ ...clip, text: 'Hello there!' }, 'sapi', zira)).not.toBe(base);
    expect(clipSha({ ...clip, voice: 'david-firm' }, 'sapi', zira)).not.toBe(base);
    expect(clipSha(clip, 'piper', zira)).not.toBe(base);
    expect(clipSha(clip, 'sapi', { ...zira, sapiRate: 2 })).not.toBe(base);
    expect(clipSha(clip, 'sapi', { ...zira, pitch: 1.1 })).not.toBe(base);
    expect(FILTER_VERSION).toBeGreaterThanOrEqual(2);
  });
  it('a voice setting for another engine does not make a clip stale', () => {
    expect(clipSha(clip, 'sapi', zira)).toBe(
      clipSha(clip, 'sapi', { ...zira, piper: { model: 'other' }, kitten: 'other' }),
    );
    expect(voiceSignature(zira, 'sapi')).not.toBe(voiceSignature(zira, 'piper'));
  });
  it('plans only stale clips for rendering and reports voices nobody can speak', () => {
    const voices = { 'zira-calm': zira, ghost: { label: 'g' } as VoiceDef };
    const sha = clipSha(clip, 'sapi', zira);
    const manifest = {
      clips: {
        [clip.key]: {
          opus: 'a.webm',
          aac: 'a.m4a',
          durationMs: 1000,
          sha,
          engine: 'sapi' as const,
          voice: 'zira-calm',
        },
      },
    };
    const fresh = planRender(
      [clip],
      voices,
      () => new Set<EngineId>(['sapi']),
      manifest,
      () => true,
    );
    expect(fresh.items[0]).toMatchObject({ fresh: true, engine: 'sapi', sha });
    const missingFile = planRender(
      [clip],
      voices,
      () => new Set<EngineId>(['sapi']),
      manifest,
      (f) => f !== 'a.m4a',
    );
    expect(missingFile.items[0]?.fresh).toBe(false);
    const stale = planRender(
      [{ ...clip, text: 'Changed.' }],
      voices,
      () => new Set<EngineId>(['sapi']),
      manifest,
      () => true,
    );
    expect(stale.items[0]?.fresh).toBe(false);
    const none = planRender(
      [clip, { key: 'g', voice: 'ghost', text: 'x' }, { key: 'u', voice: 'unknown', text: 'y' }],
      voices,
      () => new Set<EngineId>(['sapi']),
      undefined,
      () => true,
    );
    expect(none.unvoiced).toEqual(['ghost', 'unknown']);
    expect(none.items).toHaveLength(1);
  });
  it('expands the production library to a bounded set of clips', () => {
    const lib = realLibrary();
    const keys = new Set(
      lib.templates.flatMap((t) => clipsForTemplate(t, lib.addressTerms).map((c) => c.key)),
    );
    expect(keys.size).toBeGreaterThan(300);
    expect(keys.size).toBeLessThan(700);
    expect(clipsForTemplate(MINI_SCAM, MINI_TERMS).every((c) => c.text === c.text.trim())).toBe(true);
  });
  it('every voice a scenario uses has an engine setting in voices.yaml', () => {
    const { voices } = loadScenarios();
    for (const [id, def] of Object.entries(voices)) {
      expect(
        ENGINE_ORDER.some((e) => engineSupportsVoice(e, def)),
        id,
      ).toBe(true);
    }
  });
});

describe('ffmpeg arguments (ADR 4.1 step 4)', () => {
  it('writes the documented telephone chain', () => {
    expect(filterChain()).toBe(
      'highpass=f=300:poles=2,lowpass=f=3400:poles=2,acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=4,aresample=8000,aresample=24000,alimiter=limit=0.89,loudnorm=I=-18:TP=-2:LRA=7',
    );
  });
  it('shifts pitch before the band-pass when a voice asks for it', () => {
    const chain = filterChain({ pitch: 1.09 });
    expect(chain.startsWith('asetrate=24035,atempo=0.91743,aresample=22050,highpass')).toBe(true);
    expect(filterChain({ pitch: 1 })).toBe(filterChain());
  });
  it('encodes Opus at 16 kbps mono VoIP and AAC at 16 kbps mono 16 kHz', () => {
    const opus = opusArgs('in.wav', 'out.webm').join(' ');
    expect(opus).toContain('-c:a libopus -b:a 16k');
    expect(opus).toContain('-application voip');
    expect(opus).toContain('-ac 1');
    expect(opus).toContain('-f webm');
    const aac = aacArgs('in.wav', 'out.m4a').join(' ');
    expect(aac).toContain('-c:a aac -b:a 16k');
    expect(aac).toContain('-ar 16000');
    expect(aac).toContain('+faststart');
    expect(filterArgs('a.wav', 'b.wav')).toEqual(expect.arrayContaining(['-i', 'a.wav', '-ac', '1']));
  });
  it('holds the library budgets from the ADR', () => {
    expect(BUDGETS).toEqual({
      opusTotalBytes: 4 * 1024 * 1024,
      aacTotalBytes: 6 * 1024 * 1024,
      perCallOpusBytes: 160 * 1024,
    });
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!hasFfmpeg)('telephone band-pass really filters (AC-F5-3, needs ffmpeg)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'huc-spectrum-'));
  const run = (args: string[]): { ok: boolean; err: string } => {
    const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    return { ok: r.status === 0, err: r.stderr };
  };
  const tones = [60, 100, 190, 1000, 4500, 6000];
  const mix = join(tmp, 'mix.wav');
  const out = join(tmp, 'out.wav');
  const inputs = tones.flatMap((f) => ['-f', 'lavfi', '-i', `sine=f=${String(f)}:r=22050:d=2`]);
  beforeAll(() => {
    expect(
      run([
        '-v',
        'error',
        '-y',
        ...inputs,
        '-filter_complex',
        `amix=inputs=${String(tones.length)}:normalize=0`,
        '-ac',
        '1',
        mix,
      ]).ok,
    ).toBe(true);
    expect(run(filterArgs(mix, out)).ok).toBe(true);
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  /** RMS level in dB of one frequency band of the file. */
  function level(file: string, hz: number): number {
    const r = run([
      '-v',
      'info',
      '-i',
      file,
      '-af',
      `bandpass=f=${String(hz)}:width_type=q:w=8,astats=measure_overall=RMS_level:measure_perchannel=none`,
      '-f',
      'null',
      '-',
    ]);
    const m = [...r.err.matchAll(/RMS level dB:\s*(-?[\d.]+)/g)].at(-1);
    return Number(m?.[1]);
  }
  const rel = (hz: number): number => level(out, hz) - level(out, 1000);

  it('keeps the speech band: 1 kHz is the loudest component', () => {
    for (const hz of [60, 100, 190, 4500, 6000]) expect(rel(hz), `${String(hz)} Hz`).toBeLessThan(-8);
  });
  it('removes at least 20 dB below 100 Hz and above 4 kHz', () => {
    expect(rel(60)).toBeLessThan(-20);
    expect(rel(4500)).toBeLessThan(-20);
    expect(rel(6000)).toBeLessThan(-20);
  });
  it('rolls off between 100 and 300 Hz (about 19 dB at 100 Hz: a 2nd-order filter is not a brick wall)', () => {
    expect(rel(100)).toBeLessThan(-15);
    expect(rel(190)).toBeLessThan(-6);
  });
});

describe.skipIf(!hasFfmpeg || process.platform !== 'win32')(
  'Windows SAPI to Opus, end to end (needs Windows and ffmpeg)',
  () => {
    it('speaks a line, band-passes it and encodes both formats with a measured duration', () => {
      const dir = mkdtempSync(join(tmpdir(), 'huc-sapi-'));
      try {
        const engine = sapiEngine();
        const def: VoiceDef = { label: 'test', sapi: 'Microsoft Zira Desktop', sapiRate: 0 };
        expect(engine.canSpeak(def)).toBe(true);
        expect(engine.canSpeak({ label: 'x', sapi: 'No Such Voice' })).toBe(false);
        expect(engine.canSpeak({ label: 'x' })).toBe(false);
        const raw = join(dir, 'raw.wav');
        engine.synthesize(
          [{ text: 'Hello, this is a test of the line.', voiceId: 'test', def, out: raw }],
          dir,
        );
        const filtered = join(dir, 'f.wav');
        ffmpeg(filterArgs(raw, filtered));
        ffmpeg(opusArgs(filtered, join(dir, 'f.webm')));
        ffmpeg(aacArgs(filtered, join(dir, 'f.m4a')));
        const ms = probeDurationMs(join(dir, 'f.webm'));
        expect(ms).toBeGreaterThan(800);
        expect(ms).toBeLessThan(6000);
        expect(Math.abs(probeDurationMs(join(dir, 'f.m4a')) - ms)).toBeLessThan(200);
        expect(statSync(join(dir, 'f.webm')).size).toBeLessThan(20_000);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    it('reports the installed voices and fails clearly on a bad job', () => {
      expect(installedSapiVoices().has('Microsoft Zira Desktop')).toBe(true);
      const dir = mkdtempSync(join(tmpdir(), 'huc-sapi-'));
      try {
        expect(() =>
          sapiEngine().synthesize(
            [
              {
                text: 'x',
                voiceId: 'v',
                def: { label: 'x', sapi: 'No Such Voice' },
                out: join(dir, 'x.wav'),
              },
            ],
            dir,
          ),
        ).toThrow(/SAPI failed/);
        expect(() => ffmpeg(['-v', 'error', '-i', join(dir, 'missing.wav'), join(dir, 'o.wav')])).toThrow(
          /ffmpeg/,
        );
        expect(() => probeDurationMs(join(dir, 'missing.wav'))).toThrow(/ffprobe/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  },
);

describe('scanning files for names', () => {
  it('lists the text files of the folders given and skips build output and excluded logs', () => {
    const files = listScannable(REPO, ['scenarios', 'src']).map((f) => f.replaceAll('\\', '/'));
    expect(files.some((f) => f.endsWith('scenarios/scam/S01-bank-code.yaml'))).toBe(true);
    expect(files.some((f) => f.endsWith('src/domain/scoring/score.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('NAMES-REVIEW.md'))).toBe(false);
    expect(files.some((f) => f.endsWith('voices.yaml'))).toBe(false);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    expect(listScannable(REPO, ['does-not-exist'])).toEqual([]);
  });
});
