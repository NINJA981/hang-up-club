// Design QA helper: lays screenshots side by side in one image so a whole flow can be reviewed at a glance.
// node scripts/contact-sheet.mjs out.png cell-width file1.png file2.png ...
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [out, cellWidth, ...files] = process.argv.slice(2);
if (!out || !cellWidth || files.length === 0) {
  console.error('usage: contact-sheet.mjs out.png cell-width files...');
  process.exit(1);
}
const cells = files
  .map((f) => {
    const b64 = readFileSync(f).toString('base64');
    const label = f.split(/[\\/]/).pop();
    return `<figure><img src="data:image/png;base64,${b64}" style="width:${cellWidth}px"><figcaption>${label}</figcaption></figure>`;
  })
  .join('');
const html = `<body style="margin:0;background:#888;display:flex;gap:12px;padding:12px;align-items:flex-start;flex-wrap:wrap">
<style>figure{margin:0}figcaption{font:12px monospace;color:#fff;padding:2px}img{display:block}</style>${cells}</body>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
