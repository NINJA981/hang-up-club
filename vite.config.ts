import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * SPEC §10.2 Content Security Policy. Injected only into the production
 * build: the dev server needs inline module scripts for React Refresh.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'huc-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cspMeta(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['favicon.svg', 'theme-init.js'],
      injectManifest: {
        // App shell + scenario JSON. Audio clips are cached at runtime (ADR §3.3).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}', 'scenarios/*.json'],
        globIgnores: ['audio/**'],
      },
      manifest: {
        id: '/',
        name: 'Hang Up Club',
        short_name: 'Hang Up',
        description:
          'One realistic practice phone call a day, and some of them are real. Learn to tell a scam call from a real one.',
        start_url: '/#/today',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait',
        // DESIGN.md `bg` (light) as sRGB; the dark value is set by a media-scoped meta in index.html.
        theme_color: '#fafaf7',
        background_color: '#fafaf7',
        lang: 'en',
        categories: ['education', 'lifestyle'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'monochrome-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'monochrome' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
