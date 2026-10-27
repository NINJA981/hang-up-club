/*
 * The hero demo: the real call screen, drawn in HTML/CSS, running the app's S01
 * script on the app's own timeline, scoring and copy. Three modes:
 *   poster  the server-rendered state. Reduced motion stays here until the visitor presses Play.
 *   loop    a muted, captioned practice call that ends in The Cut, then repeats.
 *   play    the visitor takes the call: Answer, reply chips, Hang up, Call back.
 */
import { DemoAudio } from './audio';
import { confetti, shatter } from './cut';
import {
  S01,
  clock,
  markers,
  outcomeCopy,
  planTimeline,
  replan,
  score,
  type Action,
  type Markers,
  type Scored,
  type Timed,
} from './logic';
import { drawTimeline, rollClock } from '../ui/timeline';

const RING_MS = 1600;
const START_MS = 9000;
/** Where the scripted loop hangs up. Matches HERO_HANG_MS in vite/plugins.ts (first warning lands at 0:12). */
const HANG_MS = 13000;
const HOLD_MS = 4200;
const DIAL_MS = 900;
const TL_DOMAIN_MS = 35000;
const SEQUENCE_MS = 1800;

type Mode = 'poster' | 'loop' | 'play';
type Phase = 'ringing' | 'incall' | 'dialing' | 'ivr' | 'result';
type View = 'ringing' | 'incall' | 'dialing' | 'ivr' | 'cut' | 'result';

function must<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as unknown as T;
}

export class Hero {
  private readonly handset = must<HTMLElement>('handset');
  private readonly screen = must<HTMLElement>('screen');
  private readonly line = must<HTMLElement>('line');
  private readonly nb = must<HTMLElement>('nb');
  private readonly shards = must<HTMLElement>('shards');
  private readonly canvas = must<HTMLCanvasElement>('confetti');
  private readonly status = must<HTMLElement>('status');
  private readonly timer = must<HTMLElement>('timer');
  private readonly whoName = must<HTMLElement>('who-name');
  private readonly whoNum = must<HTMLElement>('who-num');
  private readonly captions = must<HTMLElement>('captions');
  private readonly capPrev = must<HTMLElement>('cap-prev');
  private readonly capNow = must<HTMLElement>('cap-now');
  private readonly chips = must<HTMLElement>('chips');
  private readonly btnAnswer = must<HTMLButtonElement>('btn-answer');
  private readonly btnHangup = must<HTMLButtonElement>('btn-hangup');
  private readonly btnCallback = must<HTMLButtonElement>('btn-callback');
  private readonly resHead = must<HTMLElement>('res-head');
  private readonly resHeadWrap = must<HTMLElement>('res-head-wrap');
  private readonly resSub = must<HTMLElement>('res-sub');
  private readonly resQuote = must<HTMLElement>('res-quote');
  private readonly resFake = must<HTMLElement>('res-fake');
  private readonly resReal = must<HTMLElement>('res-real');
  private readonly tl = must<HTMLElement>('tl-screen');
  private readonly srStatus = must<HTMLElement>('sr-status');
  private readonly tryBtn = must<HTMLButtonElement>('try-call');
  private readonly againBtn = must<HTMLButtonElement>('again');
  private readonly soundBtn = must<HTMLButtonElement>('sound');
  private readonly soundLabel = must<HTMLElement>('sound-label');
  private readonly pauseBtn = must<HTMLButtonElement>('pause');
  private readonly pauseLabel = must<HTMLElement>('pause-label');
  private readonly note = must<HTMLElement>('demo-note');

  private readonly audio = new DemoAudio();
  private readonly rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  private mode: Mode = 'poster';
  private phase: Phase = 'incall';
  private plan: Timed[] = planTimeline(S01.lines);
  private m: Markers = markers(this.plan);
  private curId: string | null = null;
  private callStart = 0;
  private phaseStart = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  private paused = false;
  private holds = new Set<string>();
  private raf = 0;
  private lastSec = -1;
  private action: { kind: Action; t: number } | undefined;
  private anims: Animation[] = [];
  private stopRoll: (() => void) | undefined;
  private stopConfetti: (() => void) | undefined;
  private timeouts: number[] = [];
  private gen = 0;
  private repeat = true;

  init(): void {
    this.btnAnswer.addEventListener('click', () => this.onAnswer());
    this.btnHangup.addEventListener('click', () => this.onAct('hangup'));
    this.btnCallback.addEventListener('click', () => this.onAct('callback'));
    this.tryBtn.addEventListener('click', () => this.startPlay());
    this.againBtn.addEventListener('click', () => this.startPlay());
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.soundBtn.addEventListener('click', () => void this.toggleSound());
    const interrupt = (): void => this.finishAll();
    this.handset.addEventListener('pointerdown', interrupt);
    this.handset.addEventListener('keydown', interrupt);
    document.addEventListener('visibilitychange', () => this.hold('hidden', document.hidden));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1];
          if (e) this.hold('offscreen', !e.isIntersecting);
        },
        { threshold: 0 },
      ).observe(this.handset);
    }
    this.handset.dataset.motion = this.rm.matches ? 'off' : 'on';
  }

  /** Called once the page is idle. */
  start(): void {
    if (this.rm.matches) {
      this.mode = 'poster';
      this.setPause(true, 'Play the demo');
      this.note.textContent =
        'The demo is paused because your device asks for less motion. Press Play to watch one call.';
      return;
    }
    this.mode = 'loop';
    this.handset.dataset.mode = 'loop';
    this.beginIncall(START_MS);
  }

  /* ── clock ─────────────────────────────────────────────────────────── */
  private gnow(): number {
    return performance.now() - this.pausedTotal;
  }
  private callMs(): number {
    return this.gnow() - this.callStart;
  }
  private setView(v: View): void {
    this.handset.dataset.state = v;
  }
  private setPhase(p: Phase, v: View): void {
    this.phase = p;
    this.phaseStart = this.gnow();
    this.setView(v);
  }

  private hold(reason: string, on: boolean): void {
    if (on) this.holds.add(reason);
    else this.holds.delete(reason);
    const want = this.holds.size > 0;
    if (want && !this.paused) this.pause();
    else if (!want && this.paused) this.resume();
  }
  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
    cancelAnimationFrame(this.raf);
    this.anims.forEach((a) => {
      if (a.playState === 'running') a.pause();
    });
    this.audio.suspend();
  }
  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pausedTotal += performance.now() - this.pausedAt;
    this.anims.forEach((a) => {
      if (a.playState === 'paused') a.play();
    });
    this.audio.resume();
    this.tick();
  }
  private setPause(pressed: boolean, label: string): void {
    this.pauseBtn.setAttribute('aria-pressed', String(pressed));
    this.pauseLabel.textContent = label;
  }
  private togglePause(): void {
    if (this.mode === 'poster') {
      this.mode = 'loop';
      this.handset.dataset.mode = 'loop';
      this.repeat = !this.rm.matches;
      this.setPause(false, 'Pause the demo');
      this.note.textContent = 'Every caller here is made up. Take the call yourself: tap Hang up.';
      this.beginIncall(START_MS);
      return;
    }
    const on = !this.holds.has('user');
    this.hold('user', on);
    this.setPause(on, on ? 'Play the demo' : 'Pause the demo');
  }

  /* ── resetting ─────────────────────────────────────────────────────── */
  private cancelAll(): void {
    this.gen++;
    cancelAnimationFrame(this.raf);
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    this.stopRoll?.();
    this.stopRoll = undefined;
    this.stopConfetti?.();
    this.stopConfetti = undefined;
    this.timeouts.forEach((t) => window.clearTimeout(t));
    this.timeouts = [];
    this.shards.replaceChildren();
    this.audio.stop();
    this.tl.removeAttribute('data-armed');
  }

  private setIdentity(name: string, num: string): void {
    this.whoName.textContent = name;
    this.whoNum.textContent = num;
  }

  private clearCaptions(): void {
    this.curId = null;
    this.capPrev.hidden = true;
    this.capNow.hidden = true;
    this.chips.hidden = true;
    this.chips.replaceChildren();
  }

  private resetToRinging(): void {
    this.cancelAll();
    this.action = undefined;
    this.lastSec = -1;
    this.plan = planTimeline(S01.lines);
    this.m = markers(this.plan);
    this.clearCaptions();
    this.setIdentity(S01.caller.display, S01.caller.number);
    this.status.textContent = 'Incoming call';
    this.timer.textContent = '0:00';
    this.handset.dataset.motion = this.rm.matches ? 'off' : 'on';
    this.setPhase('ringing', 'ringing');
    this.syncResultActions();
    this.tick();
  }

  private beginIncall(offsetMs: number): void {
    this.cancelAll();
    this.action = undefined;
    this.lastSec = -1;
    this.plan = planTimeline(S01.lines);
    this.m = markers(this.plan);
    this.clearCaptions();
    this.setIdentity(S01.caller.display, S01.caller.number);
    this.status.textContent = 'On call';
    this.callStart = this.gnow() - offsetMs;
    this.setPhase('incall', 'incall');
    this.syncResultActions();
    this.updateCaptions(offsetMs, offsetMs > 0);
    this.updateTimer(offsetMs);
    this.tick();
  }

  private syncResultActions(): void {
    const play = this.mode === 'play';
    this.resFake.hidden = play;
    this.resReal.hidden = !play;
    this.captions.setAttribute('aria-live', play ? 'polite' : 'off');
    if (play) this.nb.removeAttribute('aria-hidden');
    else this.nb.setAttribute('aria-hidden', 'true');
  }

  /* ── input ─────────────────────────────────────────────────────────── */
  private startPlay(): void {
    this.mode = 'play';
    this.handset.dataset.mode = 'play';
    this.holds.delete('user');
    this.holds.delete('offscreen');
    if (this.paused) {
      this.paused = false;
      this.pausedTotal += performance.now() - this.pausedAt;
    }
    this.pauseBtn.hidden = true;
    this.note.textContent =
      'Tap Answer. Hang up when you hear the first warning sign, or call the number on your card. Some real calls are in the full app, so listen first.';
    this.resetToRinging();
    const r = this.handset.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      this.handset.scrollIntoView({ block: 'center', behavior: this.rm.matches ? 'auto' : 'smooth' });
    }
    this.btnAnswer.focus({ preventScroll: true });
  }

  private takeOver(): void {
    this.mode = 'play';
    this.handset.dataset.mode = 'play';
    this.pauseBtn.hidden = true;
    this.note.textContent =
      'You are on the call. Hang up when you hear the first warning sign, or call the number on your card.';
    this.syncResultActions();
  }

  private onAnswer(): void {
    if (this.mode === 'poster') return this.startPlay();
    if (this.phase !== 'ringing') return;
    if (this.mode === 'loop') this.takeOver();
    this.beginIncall(0);
  }

  private onAct(kind: Action): void {
    if (this.mode === 'poster') return this.startPlay();
    if (this.phase !== 'incall') return;
    if (this.mode === 'loop') this.takeOver();
    this.act(kind);
  }

  /* ── the call ──────────────────────────────────────────────────────── */
  private updateTimer(t: number): void {
    const s = Math.floor(t / 1000);
    if (s === this.lastSec) return;
    this.lastSec = s;
    this.timer.textContent = clock(t);
  }

  private setCap(el: HTMLElement, who: string, text: string): void {
    const w = el.querySelector('.cap__who');
    const t = el.querySelector('.cap__text');
    if (w) w.textContent = who;
    if (t) t.textContent = text;
    el.hidden = false;
  }

  private updateCaptions(t: number, silent: boolean): void {
    let idx = -1;
    this.plan.forEach((p, i) => {
      if (p.startMs <= t) idx = i;
    });
    const cur = this.plan[idx];
    const id = cur?.line.id ?? null;
    if (id === this.curId) return;
    this.curId = id;
    if (!cur) {
      this.capPrev.hidden = true;
      this.capNow.hidden = true;
      return;
    }
    const prev = this.plan[idx - 1];
    if (prev) this.setCap(this.capPrev, prev.line.speaker, prev.line.text);
    else this.capPrev.hidden = true;
    this.setCap(this.capNow, cur.line.speaker, cur.line.text);
    this.capNow.classList.remove('is-new');
    void this.capNow.offsetWidth;
    if (!silent && !this.rm.matches) this.capNow.classList.add('is-new');
    this.renderChips(cur);
    if (!silent) this.audio.play(cur.line.id);
  }

  private renderChips(cur: Timed): void {
    this.chips.replaceChildren();
    if (this.mode !== 'play' || cur.line.replies.length === 0) {
      this.chips.hidden = true;
      return;
    }
    cur.line.replies.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip ui';
      b.textContent = r.label;
      b.addEventListener('click', () => {
        this.plan = replan(S01.lines, this.plan, cur.line.id, i, this.callMs());
        this.m = markers(this.plan);
        this.chips.hidden = true;
        this.chips.replaceChildren();
      });
      this.chips.append(b);
    });
    this.chips.hidden = false;
  }

  private act(kind: Action): void {
    const t = this.callMs();
    this.action = { kind, t };
    this.audio.stop();
    this.audio.click();
    this.chips.hidden = true;
    if (kind === 'hangup') {
      this.finish(score('hangup', t, this.m), t, 'hangup');
      return;
    }
    // Call back: dial the number printed on the card, listen to the recorded message.
    this.setIdentity(S01.caller.display.replace(/ Fraud Dept$/, ''), S01.callback.number);
    this.status.textContent = 'Calling the number on your card';
    this.clearCaptions();
    this.setPhase('dialing', 'dialing');
  }

  private finish(s: Scored, tMs: number, kind: Action): void {
    const copy = outcomeCopy(s.outcome, tMs, this.m);
    this.phase = 'result';
    this.phaseStart = this.gnow();
    const play = this.mode === 'play';
    const animate = !this.rm.matches && s.moment !== 'fade';
    this.fillResult(copy, kind, tMs);
    if (play) {
      this.srStatus.textContent = `${copy.headline} ${copy.subline}`;
    }
    if (!animate) {
      this.setView('result');
      this.afterResult();
      return;
    }
    const gen = this.gen;
    const box = this.screen.getBoundingClientRect();
    const hb = this.btnHangup.querySelector('.circle')?.getBoundingClientRect() ?? box;
    const origin = { x: hb.left - box.left + hb.width / 2, y: hb.top - box.top + hb.height / 2 };
    const shard = shatter(this.shards, this.line, { origin, width: box.width, height: box.height });
    this.setView('cut');
    this.anims.push(...shard);
    if (s.moment === 'cut') {
      this.timeouts.push(
        window.setTimeout(() => {
          const cs = getComputedStyle(this.handset);
          const colors = [
            '--accent',
            '--accent-dark',
            '--accent-soft',
            '--surface-2',
            '--border-strong',
            '--call-text',
          ]
            .map((v) => cs.getPropertyValue(v).trim())
            .filter(Boolean);
          this.stopConfetti = confetti(this.canvas, origin, colors);
        }, 60),
      );
    }
    this.playResultSequence(play, tMs, s.outcome === 'sharp');
    void Promise.all(shard.map((a) => a.finished.catch(() => undefined))).then(() => {
      if (gen !== this.gen) return;
      this.shards.replaceChildren();
      this.setView('result');
    });
    this.afterResult();
  }

  private afterResult(): void {
    if (this.mode === 'play') {
      this.timeouts.push(
        window.setTimeout(() => {
          if (this.phase === 'result' && this.mode === 'play') this.againBtn.focus({ preventScroll: true });
        }, SEQUENCE_MS + 200),
      );
    }
  }

  private fillResult(
    copy: { headline: string; subline: string; icon: string },
    kind: Action,
    t: number,
  ): void {
    this.nb.dataset.icon = copy.icon;
    this.resHead.textContent = copy.headline;
    this.resSub.textContent = copy.subline;
    const tl = this.tl;
    const you = Math.min(100, (t / TL_DOMAIN_MS) * 100);
    tl.style.setProperty('--you', `${you.toFixed(1)}%`);
    const word = kind === 'callback' ? 'You called back' : kind === 'none' ? 'You stayed on' : 'You hung up';
    const youLabel = tl.querySelector<HTMLElement>('.tl__label--you');
    youLabel?.setAttribute('data-pos', you < 14 ? 'start' : you > 78 ? 'end' : 'mid');
    const w = tl.querySelector('[data-tl-word]');
    const tm = tl.querySelector('[data-tl-you]');
    if (w) w.textContent = word;
    if (tm) tm.textContent = clock(t);
    tl.toggleAttribute('data-nogift', t >= this.m.tAskMs);
    const dot = tl.querySelector<HTMLElement>('[data-tl-dot]');
    const src = this.nb.querySelector(
      copy.icon === 'check' ? '[data-icon="check"] svg' : '[data-icon="info"] svg',
    );
    if (dot && src) {
      const svg = src.cloneNode(true) as SVGElement;
      svg.setAttribute('class', 'icon icon-20');
      dot.replaceChildren(svg);
    }
    const ol = tl.querySelector('ol');
    if (ol) {
      ol.replaceChildren(
        ...[`${word} at ${clock(t)}`, `Their ask at ${clock(this.m.tAskMs)}`].map((s) => {
          const li = document.createElement('li');
          li.textContent = s;
          return li;
        }),
      );
    }
    this.resQuote.hidden = false;
  }

  /** Frames from the press: headline 320, timeline 420+, subline 1100, actions 1800 (DESIGN.md → The Cut). */
  private playResultSequence(play: boolean, tMs: number, rolls: boolean): void {
    const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
    const rise = (el: HTMLElement, delay: number, dur: number, y = 8): void => {
      this.anims.push(
        el.animate(
          [
            { opacity: 0, transform: `translateY(${String(y)}px)` },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: dur, delay, easing: ease, fill: 'both' },
        ),
      );
    };
    rise(this.resHeadWrap, 320, 200);
    this.anims.push(...drawTimeline(this.tl, 420));
    rise(this.resSub, 1100, 200);
    rise(this.resQuote, 1100, 200);
    rise(play ? this.resReal : this.resFake, SEQUENCE_MS, 150, 0);
    if (rolls && !play) {
      this.stopRoll = rollClock(this.resHead, Math.floor(tMs / 1000), (c) => `Hung up at ${c}.`, 320, 600);
    }
  }

  /** Any tap or key jumps every element to its end state in one frame. */
  private finishAll(): void {
    if (this.phase !== 'result' || this.anims.length === 0) return;
    this.anims.forEach((a) => {
      try {
        a.finish();
      } catch {
        /* infinite or already finished */
      }
    });
    this.stopRoll?.();
    this.stopRoll = undefined;
    this.stopConfetti?.();
    this.stopConfetti = undefined;
  }

  /* ── frame loop ────────────────────────────────────────────────────── */
  private tick = (): void => {
    if (this.paused) return;
    this.raf = requestAnimationFrame(this.tick);
    const g = this.gnow();
    switch (this.phase) {
      case 'ringing': {
        const el = g - this.phaseStart;
        if (this.mode === 'loop' && el >= RING_MS) this.beginIncall(0);
        else if (el > 20000) this.handset.dataset.motion = 'off';
        break;
      }
      case 'incall': {
        const t = this.callMs();
        this.updateTimer(t);
        this.updateCaptions(t, false);
        if (this.mode === 'loop' && t >= HANG_MS) this.act('hangup');
        else if (this.mode === 'play' && t >= this.m.tEndMs + 300)
          this.finish(score('none', t, this.m), this.m.tEndMs, 'none');
        break;
      }
      case 'dialing': {
        if (g - this.phaseStart >= DIAL_MS) {
          const ivr = S01.callback.ivr[0];
          this.setPhase('ivr', 'ivr');
          this.status.textContent = 'On call';
          if (ivr) {
            this.setCap(this.capNow, 'Customer service', ivr.text);
            this.capPrev.hidden = true;
            this.capNow.classList.remove('is-new');
            void this.capNow.offsetWidth;
            if (!this.rm.matches) this.capNow.classList.add('is-new');
            this.audio.play(ivr.id);
          }
        }
        break;
      }
      case 'ivr': {
        const ivr = S01.callback.ivr[0];
        if (g - this.phaseStart >= (ivr?.durationMs ?? 3000) + 900 && this.action) {
          this.finish(score('callback', this.action.t, this.m), this.action.t, 'callback');
        }
        break;
      }
      case 'result': {
        if (this.mode === 'loop' && this.repeat && g - this.phaseStart > SEQUENCE_MS + HOLD_MS)
          this.resetToRinging();
        break;
      }
    }
  };

  /* ── sound ─────────────────────────────────────────────────────────── */
  private async toggleSound(): Promise<void> {
    if (this.audio.enabled) {
      this.audio.disable();
      this.soundBtn.setAttribute('aria-pressed', 'false');
      this.soundLabel.textContent = 'Sound: Off';
      return;
    }
    this.soundBtn.setAttribute('aria-busy', 'true');
    this.soundLabel.textContent = 'Loading sound…';
    const ok = await this.audio.enable();
    this.soundBtn.removeAttribute('aria-busy');
    this.soundBtn.setAttribute('aria-pressed', String(ok));
    this.soundLabel.textContent = ok ? 'Sound: On' : 'Sound: Off';
    if (!ok) this.note.textContent = 'The sound could not load. The captions carry the whole call.';
  }
}
