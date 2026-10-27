/*
 * Timeline draw sequence (DESIGN.md → The Cut, frames 420–1100 ms), reused by the
 * hero result and by the big board further down the page. WAAPI, transform and
 * opacity only.
 */

/** DESIGN.md SPRING.playful: { visualDuration 0.4, bounce 0.25 }, sampled into a CSS linear() easing. */
export function springEasing(visualDuration: number, bounce: number): { easing: string; duration: number } {
  const zeta = 1 - bounce;
  const wd = Math.PI / visualDuration;
  const w0 = wd / Math.sqrt(1 - zeta * zeta);
  const settle = Math.max(visualDuration * 2, 4 / (zeta * w0));
  const n = 48;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * settle;
    const x =
      i === n
        ? 1
        : 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    pts.push((Math.round(x * 1000) / 1000).toString());
  }
  return { easing: `linear(${pts.join(', ')})`, duration: settle * 1000 };
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const playful = springEasing(0.4, 0.25);

function q(root: Element, key: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[data-anim="${key}"]`));
}

/** Plays the draw. `delay` is the time before the track starts. */
export function drawTimeline(tl: HTMLElement, delay = 0): Animation[] {
  const out: Animation[] = [];
  const fade = (el: HTMLElement, at: number, dur = 150): void => {
    out.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, delay: delay + at, easing: EASE_OUT, fill: 'both' }));
  };
  const scaleX = (el: HTMLElement, at: number, dur: number): void => {
    out.push(
      el.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1 }], {
        duration: dur,
        delay: delay + at,
        easing: EASE_OUT,
        fill: 'both',
      }),
    );
  };
  q(tl, 'track').forEach((el) => scaleX(el, 0, 600));
  q(tl, 'flag').forEach((el) => {
    const at = parseFloat(el.style.getPropertyValue('--at')) / 100;
    fade(el, Math.round(600 * (Number.isFinite(at) ? at : 0.3)));
  });
  q(tl, 'ask-bar').forEach((el) => {
    out.push(
      el.animate([{ transform: 'scaleY(0)', opacity: 1 }, { transform: 'scaleY(1)', opacity: 1 }], {
        duration: 200,
        delay: delay + 360,
        easing: EASE_OUT,
        fill: 'both',
      }),
    );
  });
  q(tl, 'ask-label').forEach((el) => fade(el, 410));
  q(tl, 'you-stem').forEach((el) => fade(el, 600, 100));
  q(tl, 'you-dot').forEach((el) => {
    out.push(
      el.animate(
        [
          { transform: 'translateY(-12px)', opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: playful.duration, delay: delay + 600, easing: playful.easing, fill: 'both' },
      ),
    );
  });
  q(tl, 'you-label').forEach((el) => fade(el, 700));
  q(tl, 'fill').forEach((el) => scaleX(el, 640, 200));
  q(tl, 'gift').forEach((el) => scaleX(el, 640, 200));
  return out;
}

/** Roll a clock-style text from 0:00 to its final value. */
export function rollClock(el: HTMLElement, toSeconds: number, template: (c: string) => string, delay: number, duration: number): () => void {
  let raf = 0;
  const start = performance.now() + delay;
  const fmt = (s: number): string => `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
  const step = (now: number): void => {
    if (now < start) {
      el.textContent = template(fmt(0));
      raf = requestAnimationFrame(step);
      return;
    }
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = template(fmt(Math.round(eased * toSeconds)));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    el.textContent = template(fmt(toSeconds));
  };
}
