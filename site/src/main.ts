import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';
import './styles/handset.css';
import { Hero } from './call/hero';
import { initBoards } from './ui/boards';

initBoards();

const hero = new Hero();
hero.init();

// Poster first: the call screen is already in the HTML. Start the loop only after load and idle.
const startHero = (): void => hero.start();
const whenIdle = (): void => {
  const ric = (
    window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  ).requestIdleCallback;
  if (typeof ric === 'function') ric.call(window, startHero, { timeout: 2000 });
  else window.setTimeout(startHero, 300);
};
if (document.readyState === 'complete') whenIdle();
else window.addEventListener('load', whenIdle, { once: true });
