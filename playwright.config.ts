import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // e2e runs against the production build so the CSP and service worker are real.
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
