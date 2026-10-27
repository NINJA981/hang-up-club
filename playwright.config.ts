import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const SITE_PORT = Number(process.env.E2E_SITE_PORT ?? 47213);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // 32 logical CPUs would mean 16 browsers on 15 GB of RAM (renderers were seen crashing); the timing assertions (recording, ringing, the
  // Cut) need a machine that is not starved, so the pool is capped.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Not 'retain-on-failure': recording a trace for every test is held in the worker's heap, and with the
    // long axe walks (40+ axe runs per test) a worker capped at 1 GB (NODE_OPTIONS on a small machine)
    // died with "worker process exited unexpectedly" after three of them. Traces are kept for a retry
    // (CI retries once), or on demand with --trace=on.
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-phone',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
    { name: 'chromium-desktop', testIgnore: /perf\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Timing budgets (LCP, INP) are measured alone, after everything else has finished, because they
    // are meaningless on a machine busy with 8 other browsers.
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      fullyParallel: false,
      workers: 1,
      dependencies: ['chromium-phone', 'chromium-desktop', 'site'],
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
    // The landing page in site/ is a separate package with its own build; this is its smoke test.
    {
      name: 'site',
      testDir: 'tests/site',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(SITE_PORT)}` },
    },
  ],
  // e2e runs against the production build so the CSP and service worker are real.
  webServer: [
    {
      command: `pnpm build && pnpm exec vite preview --port ${String(PORT)} --strictPort`,
      url: `http://localhost:${String(PORT)}`,
      // Never adopt a server that is already on the port: on a shared machine it can be another
      // project's, and the whole suite would then test the wrong app. Set E2E_REUSE=1 to reuse one on purpose.
      reuseExistingServer: process.env.E2E_REUSE === '1',
      timeout: 180_000,
    },
    {
      command: `pnpm --dir site build && pnpm --dir site exec vite preview --port ${String(SITE_PORT)} --strictPort`,
      url: `http://localhost:${String(SITE_PORT)}`,
      reuseExistingServer: process.env.E2E_REUSE === '1',
      timeout: 180_000,
    },
  ],
});
