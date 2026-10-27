import { defineConfig } from 'vite';
import { fontPreload, htmlTemplates, readConfig } from './vite/plugins.ts';

const cfg = readConfig(process.env);
if (!process.env.SITE_REPO_URL) {
  console.warn(
    '[site] SITE_REPO_URL is not set: the GitHub call to action falls back to the in-page "Run it from source" section.',
  );
}
if (!process.env.SITE_APP_URL) {
  console.warn(
    '[site] SITE_APP_URL is not set: "Open the app" points to /app/ (placeholder; set it to the deployed PWA).',
  );
}

export default defineConfig({
  base: './',
  plugins: [htmlTemplates(cfg), fontPreload()],
  build: {
    target: 'es2023',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  server: { port: 5180, strictPort: true },
});
