import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit tests run in Node by default. Files that need a DOM opt in with a
// `// @vitest-environment jsdom` docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
    restoreMocks: true,
    // The SAPI and ffmpeg tests start external processes, which can be slow on a busy machine.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/storage/**', 'src/state/**', 'src/audio/**', 'scripts/lib/**'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        'src/domain/**': { lines: 95, statements: 95 },
      },
    },
  },
});
