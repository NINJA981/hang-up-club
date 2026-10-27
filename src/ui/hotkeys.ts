import { useEffect, useRef } from 'react';

/** True while the user is typing: single-key shortcuts must stay out of the way. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * Single-key shortcuts (DESIGN.md Keyboard). They are off while an input is
 * focused, while a modifier is held, and when `enabled` is false. Keys are
 * matched case-insensitively; a handler is called with the original event.
 */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true): void {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      const handler = ref.current[e.key.toLowerCase()] ?? ref.current[e.key];
      if (handler) handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
}
