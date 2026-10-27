import { expect, type BrowserContext, type Page } from '@playwright/test';

/** Records every request that leaves the app's own origin. data: and blob: URLs never touch the network. */
export function guardOrigin(page: Page, baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  const offOrigin: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== origin) offOrigin.push(req.url());
  });
  return offOrigin;
}

/** `?test=1` is a silent audio engine with real timing; `?seed=7` makes today's call the same every run (S01). */
export const TEST_URL = '/?test=1&seed=7';

/** Walk the welcome flow as a player called Paati. Ends on Today. */
export async function onboard(page: Page, opts: { url?: string; term?: string } = {}): Promise<void> {
  await page.goto(opts.url ?? `${TEST_URL}#/today`);
  await page.getByRole('button', { name: 'Set up for me' }).click();
  await page.getByRole('radio', { name: opts.term ?? 'Paati' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Yes, I hear it' }).click();
  await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();
}

export async function startCall(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Take today/ }).click();
  await expect(page.getByTestId('the-line')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Answer' })).toBeVisible();
}

/** The caller's clock, read from the call timer. */
export async function callSeconds(page: Page): Promise<number> {
  const label = (await page.getByRole('timer').getAttribute('aria-label')) ?? '';
  const m = /(\d+):(\d\d)/.exec(label);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Wait until the call clock reaches `s` seconds. */
export async function waitForCallSecond(page: Page, s: number): Promise<void> {
  await expect.poll(() => callSeconds(page), { timeout: 60_000, intervals: [250] }).toBeGreaterThanOrEqual(s);
}

/** Answer, let the first flag pass (about 13 s into S01 with seed 7), hang up. Ends on the result. */
export async function takeSharpCall(page: Page, at = 15): Promise<void> {
  await startCall(page);
  await page.getByRole('button', { name: 'Answer' }).click();
  await waitForCallSecond(page, at);
  await page.getByRole('button', { name: 'Hang up', exact: true }).click();
  await expect(page.getByTestId('result-headline')).toBeVisible();
}

export async function waitForServiceWorker(page: Page, context: BrowserContext): Promise<void> {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error('no active service worker');
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  void context;
}

/* ---------------------------------------------------------------------------
 * Real-audio tests (no `?test=1`). Headless Chromium has a null audio sink, but
 * the Web Audio graph is real: clips are fetched, decoded and scheduled. These
 * helpers record what the app asks the audio clock to do, so a test can assert
 * what would be heard (which tones, which clips, how fast a hang-up goes silent)
 * without a speaker.
 * ------------------------------------------------------------------------- */

export interface AudioEvent {
  kind: 'osc-start' | 'osc-stop' | 'src-start' | 'src-stop' | 'gain-target' | 'decode' | 'vibrate' | 'speak';
  /** performance.now() when the app made the call. */
  perf: number;
  /** AudioContext.currentTime when the app made the call. */
  ctxNow: number;
  /** The `when` argument, or the oscillator frequency, or the vibrate pattern, or the spoken text. */
  when?: number;
  freq?: number;
  loop?: boolean;
  duration?: number;
  value?: number;
  tc?: number;
  pattern?: number | number[];
  text?: string;
}

export interface AudioProbeOptions {
  /** Make decodeAudioData reject (a cheer this browser cannot decode, AC-F8-6). */
  failDecode?: boolean;
  /** Voices the stubbed speechSynthesis reports. `undefined` leaves the browser's own. */
  voices?: { name: string; lang: string; localService: boolean; default?: boolean }[];
  /** Replace navigator.vibrate with a recorder. */
  vibrate?: boolean;
}

/** Install before the first navigation. Read with `audioEvents(page)`. */
export async function instrumentAudio(page: Page, opts: AudioProbeOptions = {}): Promise<void> {
  await page.addInitScript((o: AudioProbeOptions) => {
    const w = window as unknown as { __audio: unknown[]; __failDecode: boolean };
    w.__audio = [];
    w.__failDecode = o.failDecode === true;
    const rec = (e: Record<string, unknown>, ctx?: BaseAudioContext): void => {
      w.__audio.push({ ...e, perf: performance.now(), ctxNow: ctx ? ctx.currentTime : 0 });
    };
    const P = BaseAudioContext.prototype;

    const createOscillator = P.createOscillator;
    P.createOscillator = function (this: BaseAudioContext) {
      const osc = createOscillator.call(this);
      const start = osc.start.bind(osc);
      const stop = osc.stop.bind(osc);
      osc.start = (when?: number) => {
        rec({ kind: 'osc-start', when, freq: osc.frequency.value }, this);
        start(when);
      };
      osc.stop = (when?: number) => {
        rec({ kind: 'osc-stop', when, freq: osc.frequency.value }, this);
        stop(when);
      };
      return osc;
    };

    const createBufferSource = P.createBufferSource;
    P.createBufferSource = function (this: BaseAudioContext) {
      const src = createBufferSource.call(this);
      const start = src.start.bind(src);
      const stop = src.stop.bind(src);
      src.start = (when?: number, offset?: number, duration?: number) => {
        rec({ kind: 'src-start', when, loop: src.loop, duration: src.buffer?.duration }, this);
        start(when, offset, duration);
      };
      src.stop = (when?: number) => {
        rec({ kind: 'src-stop', when, duration: src.buffer?.duration }, this);
        stop(when);
      };
      return src;
    };

    const createGain = P.createGain;
    P.createGain = function (this: BaseAudioContext) {
      const g = createGain.call(this);
      const set = g.gain.setTargetAtTime.bind(g.gain);
      g.gain.setTargetAtTime = (value: number, startTime: number, tc: number) => {
        rec({ kind: 'gain-target', value, when: startTime, tc }, this);
        return set(value, startTime, tc);
      };
      return g;
    };

    const decode = P.decodeAudioData;
    P.decodeAudioData = function (this: BaseAudioContext, ...args: Parameters<typeof decode>) {
      rec({ kind: 'decode' }, this);
      if (w.__failDecode)
        return Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
      return decode.apply(this, args);
    };

    if (o.vibrate === true) {
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (pattern: number | number[]) => {
          rec({ kind: 'vibrate', pattern });
          return true;
        },
      });
    }

    if (o.voices) {
      const voices = o.voices.map((v) => ({ default: false, voiceURI: v.name, ...v }));
      const synth = {
        speaking: false,
        pending: false,
        paused: false,
        getVoices: () => voices,
        speak: (u: { text: string }) => {
          rec({ kind: 'speak', text: u.text });
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        onvoiceschanged: null,
      };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
      // The browser only accepts its own voice objects here; the stub's voices are plain objects.
      Object.defineProperty(SpeechSynthesisUtterance.prototype, 'voice', {
        configurable: true,
        get(this: { _v?: unknown }) {
          return this._v ?? null;
        },
        set(this: { _v?: unknown }, v: unknown) {
          this._v = v;
        },
      });
    }
  }, opts);
}

export async function audioEvents(page: Page): Promise<AudioEvent[]> {
  return page.evaluate(() => (window as unknown as { __audio?: AudioEvent[] }).__audio ?? []);
}

/** Record when each element was clicked, on the page's own clock (performance.now), before the app sees it. */
export async function stampClicks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __clicks: { label: string; perf: number; ctxNow: number }[] };
    w.__clicks = [];
    document.addEventListener(
      'click',
      (e) => {
        const el = (e.target as Element | null)?.closest('button');
        const label = el?.getAttribute('aria-label') ?? el?.textContent.trim() ?? '';
        w.__clicks.push({ label, perf: performance.now(), ctxNow: 0 });
      },
      true,
    );
  });
}

export async function clickStamps(page: Page): Promise<{ label: string; perf: number }[]> {
  return page.evaluate(
    () => (window as unknown as { __clicks?: { label: string; perf: number }[] }).__clicks ?? [],
  );
}

/** Every attempt the app saved, read straight from IndexedDB (the app's own store of record). */
export async function savedAttempts(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const open = indexedDB.open('huc');
        open.onerror = () => {
          reject(new Error('cannot open the database'));
        };
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('attempts').objectStore('attempts').getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result as Record<string, unknown>[]);
          };
          req.onerror = () => {
            reject(new Error('cannot read attempts'));
          };
        };
      }),
  );
}
