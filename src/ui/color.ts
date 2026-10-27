/**
 * Canvas libraries (confetti, QR codes) cannot read `oklch()` tokens, so the
 * token is resolved to sRGB through a 1x1 canvas. The values still come from
 * DESIGN.md's CSS variables: nothing is hard-coded here.
 */
let canvas: HTMLCanvasElement | undefined;

export function tokenToRgb(token: string, scope: Element = document.documentElement): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  probe.style.display = 'none';
  scope.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  canvas ??= document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'gray'; // only when a canvas is unavailable
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, '0')).join('')}`;
}
