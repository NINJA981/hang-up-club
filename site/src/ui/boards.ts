/*
 * Below-the-fold timelines draw once when they come into view (25% visible),
 * with a Replay button. Without JS, or under reduced motion, they are simply
 * drawn in their final state.
 */
import { drawTimeline } from './timeline';

export function initBoards(): void {
  const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const boards = Array.from(document.querySelectorAll<HTMLElement>('[data-board]'));
  const replayButtons = document.querySelectorAll<HTMLElement>('[data-replay-tl]');
  if (rm.matches || !('IntersectionObserver' in window)) {
    replayButtons.forEach((b) => (b.hidden = true));
    return;
  }

  const play = (board: HTMLElement): void => {
    const tl = board.querySelector<HTMLElement>('[data-tl]');
    if (!tl) return;
    const anims = drawTimeline(tl, 0);
    tl.setAttribute('data-armed', '');
    void Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
      tl.removeAttribute('data-armed');
      anims.forEach((a) => a.cancel());
    });
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        play(e.target as HTMLElement);
      }
    },
    { threshold: 0.25 },
  );

  for (const board of boards) {
    const tl = board.querySelector<HTMLElement>('[data-tl]');
    if (!tl) continue;
    tl.setAttribute('data-armed', '');
    io.observe(board);
  }
  replayButtons.forEach((b) =>
    b.addEventListener('click', () => {
      const board = b.closest<HTMLElement>('[data-board]');
      if (board) play(board);
    }),
  );
}
